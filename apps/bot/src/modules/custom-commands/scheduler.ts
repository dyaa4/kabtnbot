import type { Client, Guild, TextChannel } from 'discord.js';
import { getScheduleRuns, setScheduleRun, type ScheduleRun } from '@gamebot/db';
import type { CommandFlow, FlowAction, FlowSchedule } from '@gamebot/shared';
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
 * One independently-timed run: either a flow's base batch (all actions
 * without their own cadence, on the flow interval) or a single action that
 * set `repeat_minutes` (its own interval, tracked under `flowId:actionId`).
 */
export interface ScheduledUnit {
  key: string;
  flow: CommandFlow;
  actions: FlowAction[];
  /** Interval cadence in minutes; null = daily mode (fires at flow.schedule.at). */
  every_minutes: number | null;
  /** Stop after N executed runs (0 = unlimited). */
  max_runs: number;
}

export function scheduledUnits(flows: CommandFlow[]): ScheduledUnit[] {
  const units: ScheduledUnit[] = [];
  for (const flow of flows) {
    if (!flow.enabled || !flow.schedule.enabled || !flow.schedule.channel_id) continue;
    const base = flow.actions.filter((a) => a.repeat_minutes === 0);
    if (base.length > 0) {
      units.push({
        key: flow.id,
        flow,
        actions: base,
        every_minutes: flow.schedule.mode === 'daily' ? null : flow.schedule.every_minutes,
        max_runs: flow.schedule.max_runs,
      });
    }
    // Per-action cadences are always intervals, even under a daily flow.
    for (const action of flow.actions) {
      if (action.repeat_minutes > 0) {
        units.push({
          key: `${flow.id}:${action.id}`,
          flow,
          actions: [action],
          every_minutes: action.repeat_minutes,
          max_runs: flow.schedule.max_runs,
        });
      }
    }
  }
  return units;
}

/**
 * Today's occurrence of `at` (HH:MM on the schedule's own wall clock) as real
 * UTC. tz_offset_minutes was captured from the admin's browser — the bot
 * host's timezone never matters.
 */
export function dailyTargetUtc(schedule: Pick<FlowSchedule, 'at' | 'tz_offset_minutes'>, now: Date): Date {
  const shifted = new Date(now.getTime() + schedule.tz_offset_minutes * 60_000);
  const [h, m] = schedule.at.split(':').map(Number);
  const targetShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), h, m);
  return new Date(targetShifted - schedule.tz_offset_minutes * 60_000);
}

/**
 * Pure partition of a guild's scheduled units: `due` = cadence reached
 * (interval elapsed, or today's daily time passed without a run since) and
 * the run allowance not exhausted; `init` = never seen before (gets a
 * last-run stamp WITHOUT executing, so enabling a schedule doesn't fire
 * instantly on save).
 */
export function partitionScheduled(
  flows: CommandFlow[],
  lastRuns: Map<string, ScheduleRun>,
  now: Date,
): { due: ScheduledUnit[]; init: ScheduledUnit[] } {
  const due: ScheduledUnit[] = [];
  const init: ScheduledUnit[] = [];
  for (const unit of scheduledUnits(flows)) {
    const last = lastRuns.get(unit.key);
    if (!last) { init.push(unit); continue; }
    if (unit.max_runs > 0 && last.count >= unit.max_runs) continue;
    if (unit.every_minutes === null) {
      const target = dailyTargetUtc(unit.flow.schedule, now);
      if (now.getTime() >= target.getTime() && last.at.getTime() < target.getTime()) due.push(unit);
    } else if (now.getTime() - last.at.getTime() >= unit.every_minutes * 60_000) {
      due.push(unit);
    }
  }
  return { due, init };
}

async function runUnit(guild: Guild, unit: ScheduledUnit, now: Date): Promise<void> {
  // Stamp BEFORE executing — a slow action must not double-fire on the next
  // tick. countRun=true: this stamp consumes one of the unit's max_runs.
  await setScheduleRun(guild.id, unit.key, now, true);

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
  const { reply } = await executeActions(unit.actions, ctx);
  if (!reply) return;

  const channel = guild.channels.cache.get(unit.flow.schedule.channel_id);
  if (channel?.isTextBased()) {
    const userIds = [...reply.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]).slice(0, 25);
    await (channel as TextChannel)
      .send({ content: reply.slice(0, 2000), allowedMentions: { parse: [], users: userIds } })
      .catch(() => {});
  }
  // Re-resolve instead of reusing the pre-run snapshot: a voice_join action
  // may have just created the session, and its reply should be spoken too.
  if (getSession(guild.id)) await playSpeech(guild.id, reply).catch(() => {});
}

export async function runScheduleSweep(client: Client, now: Date = new Date()): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      const { flows } = await getCachedCommandFlows(guild.id);
      if (!flows.some((f) => f.enabled && f.schedule.enabled)) continue;

      const lastRuns = await getScheduleRuns(guild.id);
      const { due, init } = partitionScheduled(flows, lastRuns, now);
      for (const unit of init) await setScheduleRun(guild.id, unit.key, now);
      for (const unit of due) {
        await runUnit(guild, unit, now).catch((err) =>
          console.error(`[Scheduler ${guild.id}] ${unit.key}:`, err),
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
