import { BotStatusModel, type BotStatusDoc } from '../models.js';

// The bot heartbeats every 30s; three missed beats = offline.
export const BOT_OFFLINE_AFTER_MS = 90_000;

export interface BotStatus {
  online: boolean;
  last_seen: string | null; // ISO timestamp
  guild_count: number;
}

/** Called by the bot process on a timer; the dashboard reads it via getBotStatus. */
export async function recordBotHeartbeat(guildCount: number): Promise<void> {
  await BotStatusModel.updateOne(
    { key: 'bot' },
    { $set: { last_seen: new Date(), guild_count: guildCount } },
    { upsert: true },
  );
}

/** Called on graceful shutdown so the dashboard flips to offline immediately. */
export async function clearBotHeartbeat(): Promise<void> {
  await BotStatusModel.deleteOne({ key: 'bot' });
}

export async function getBotStatus(now: Date = new Date()): Promise<BotStatus> {
  const doc = (await BotStatusModel.findOne({ key: 'bot' }).lean()) as BotStatusDoc | null;
  if (!doc) return { online: false, last_seen: null, guild_count: 0 };
  return {
    online: now.getTime() - doc.last_seen.getTime() < BOT_OFFLINE_AFTER_MS,
    last_seen: doc.last_seen.toISOString(),
    guild_count: doc.guild_count,
  };
}
