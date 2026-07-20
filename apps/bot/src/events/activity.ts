import type { Client } from 'discord.js';
import { recordMessage, recordReaction, addVoiceSeconds } from '@gamebot/db';
import { todayKey } from '@gamebot/shared';

export function elapsedSeconds(prevMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - prevMs) / 1000));
}

/**
 * Split a voice span [startMs, endMs) into per-UTC-day chunks so a session that
 * crosses midnight credits each day its own seconds (the daily voice chart is
 * keyed by UTC day). Without this, all of a 23:00→01:00 session landed on the
 * SECOND day and the first day showed zero. Exported for tests.
 */
export function splitSecondsByDay(startMs: number, endMs: number): { date: string; seconds: number }[] {
  const out: { date: string; seconds: number }[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const d = new Date(cursor);
    const nextMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    const segEnd = Math.min(nextMidnight, endMs);
    const seconds = Math.floor((segEnd - cursor) / 1000);
    if (seconds > 0) out.push({ date: new Date(cursor).toISOString().slice(0, 10), seconds });
    cursor = segEnd;
  }
  return out;
}

/** guildId:userId → epoch ms when the user (re)entered a voice channel. */
export const voiceJoinTimes = new Map<string, number>();

export function registerActivityTracking(client: Client, now: () => number = Date.now): void {
  // Seed members already sitting in voice at startup (mirrors voice-log's
  // reconcile): without this, anyone who stays in voice across a bot restart
  // has no join entry and accrues ZERO voice seconds for the whole session.
  client.once('clientReady', () => {
    for (const guild of client.guilds.cache.values()) {
      for (const [, vs] of guild.voiceStates.cache) {
        if (!vs.channelId || vs.member?.user.bot) continue;
        const key = `${guild.id}:${vs.id}`;
        if (!voiceJoinTimes.has(key)) voiceJoinTimes.set(key, now());
      }
    }
  });

  client.on('messageCreate', (msg) => {
    if (!msg.guildId || msg.author.bot) return;
    // Runs independently of text protection (which may delete the message afterwards), so
    // a message later deleted as a scam/violation still counts toward activity — accepted.
    void recordMessage(msg.guildId, msg.author.id, todayKey()).catch((e) => console.error('[activity] msg:', e));
  });

  client.on('messageReactionAdd', (_reaction, user) => {
    if (user.bot) return;
    const guildId = _reaction.message.guildId;
    if (!guildId) return;
    void recordReaction(guildId, user.id, todayKey()).catch((e) => console.error('[activity] react:', e));
  });

  // Bank the elapsed span, split across UTC days so a midnight-spanning session
  // credits each day correctly (not all to the leave day).
  const bank = (guildId: string, userId: string, start: number, end: number) => {
    for (const seg of splitSecondsByDay(start, end)) {
      void addVoiceSeconds(guildId, userId, seg.date, seg.seconds).catch(() => {});
    }
  };

  client.on('voiceStateUpdate', (oldState, newState) => {
    const guildId = newState.guild.id;
    const userId = newState.id;
    if (newState.member?.user.bot) return;
    const key = `${guildId}:${userId}`;
    const wasIn = oldState.channelId;
    const isIn = newState.channelId;
    if (!wasIn && isIn) {
      voiceJoinTimes.set(key, now());
    } else if (wasIn && !isIn) {
      const start = voiceJoinTimes.get(key);
      voiceJoinTimes.delete(key);
      if (start !== undefined) bank(guildId, userId, start, now());
    } else if (wasIn && isIn && wasIn !== isIn) {
      // channel move: bank the elapsed, restart the clock
      const start = voiceJoinTimes.get(key);
      if (start !== undefined) bank(guildId, userId, start, now());
      voiceJoinTimes.set(key, now());
    }
  });
}
