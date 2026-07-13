import type { Client, Guild, TextChannel } from 'discord.js';
import { getScheduleRuns, setScheduleRun } from '@gamebot/db';
import type { CommandFlow } from '@gamebot/shared';
import { getCachedCommandFlows } from '../../lib/flows-cache.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { getSession, playSpeech } from '../voice-ai/sessions.js';
import { executeActions, type ExecContext } from './executor.js';

/**
 * Scheduled automations: flows with schedule.enabled run every
 * `every_minutes`, their reply posted into the configured channel (and spoken
 * too while a voice session is live). Last-run times persist in Mongo so a
 * redeploy never resets long intervals.
 */

export const SCHEDULER_TICK_MS = 60_000;

// ai_reply has no user utterance on a scheduled run — this stands in as the
// "question" so the action's custom system prompt fully drives the output.
const SCHEDULED_AI_INPUT = 'Write the scheduled post now, following your instructions.';

/**
 * Pure partition of a guild's flows: `due` = interval elapsed since last run;
 * `init` = scheduled but never seen before (gets a last-run stamp WITHOUT
 * executing, so enabling a schedule doesn't fire instantly on save).
 */
export function partitionScheduled(
  flows: CommandFlow[],
  lastRuns: Map<string, Date>,
  now: Date,
): { due: CommandFlow[]; init: CommandFlow[] } {
  const due: CommandFlow[] = [];
  const init: CommandFlow[] = [];
  for (const flow of flows) {
    if (!flow.enabled || !flow.schedule.enabled || !flow.schedule.channel_id) continue;
    const last = lastRuns.get(flow.id);
    if (!last) init.push(flow);
    else if (now.getTime() - last.getTime() >= flow.schedule.every_minutes * 60_000) due.push(flow);
  }
  return { due, init };
}

async function runFlow(guild: Guild, flow: CommandFlow, now: Date): Promise<void> {
  // Stamp BEFORE executing — a slow action must not double-fire on the next tick.
  await setScheduleRun(guild.id, flow.id, now);

  const config = await getCachedGuildConfig(guild.id);
  const session = getSession(guild.id);
  const ctx: ExecContext = {
    guild,
    invokerId: guild.client.user?.id ?? '',
    utterance: SCHEDULED_AI_INPUT,
    args: '',
    source: 'schedule',
    session,
    config,
  };
  const { reply } = await executeActions(flow.actions, ctx);
  if (!reply) return;

  const channel = guild.channels.cache.get(flow.schedule.channel_id);
  if (channel?.isTextBased()) {
    const userIds = [...reply.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]).slice(0, 25);
    await (channel as TextChannel)
      .send({ content: reply.slice(0, 2000), allowedMentions: { parse: [], users: userIds } })
      .catch(() => {});
  }
  if (session) await playSpeech(guild.id, reply).catch(() => {});
}

export async function runScheduleSweep(client: Client, now: Date = new Date()): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      const { flows } = await getCachedCommandFlows(guild.id);
      if (!flows.some((f) => f.enabled && f.schedule.enabled)) continue;

      const lastRuns = await getScheduleRuns(guild.id);
      const { due, init } = partitionScheduled(flows, lastRuns, now);
      for (const flow of init) await setScheduleRun(guild.id, flow.id, now);
      for (const flow of due) {
        await runFlow(guild, flow, now).catch((err) =>
          console.error(`[Scheduler ${guild.id}] flow ${flow.id}:`, err),
        );
      }
    } catch (err) {
      console.error(`[Scheduler ${guild.id}]`, err);
    }
  }
}

export function registerFlowScheduler(client: Client): void {
  client.once('clientReady', () => {
    setInterval(
      () => void runScheduleSweep(client).catch((err) => console.error('[Scheduler]', err)),
      SCHEDULER_TICK_MS,
    );
  });
}
