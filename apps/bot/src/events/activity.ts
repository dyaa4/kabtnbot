import type { Client } from 'discord.js';
import { recordMessage, recordReaction, addVoiceSeconds } from '@gamebot/db';
import { todayKey } from '@gamebot/shared';

export function elapsedSeconds(prevMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - prevMs) / 1000));
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
      if (start !== undefined) void addVoiceSeconds(guildId, userId, todayKey(), elapsedSeconds(start, now())).catch(() => {});
    } else if (wasIn && isIn && wasIn !== isIn) {
      // channel move: bank the elapsed, restart the clock
      const start = voiceJoinTimes.get(key);
      if (start !== undefined) void addVoiceSeconds(guildId, userId, todayKey(), elapsedSeconds(start, now())).catch(() => {});
      voiceJoinTimes.set(key, now());
    }
  });
}
