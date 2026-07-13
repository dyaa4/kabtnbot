import { BotStatusModel, type BotStatusDoc, type BotFeatures } from '../models.js';
import { retryOnDupKey } from '../retry.js';

// The bot heartbeats every 30s; three missed beats = offline.
export const BOT_OFFLINE_AFTER_MS = 90_000;

export interface BotStatus {
  online: boolean;
  last_seen: string | null; // ISO timestamp
  guild_count: number;
  /** Env-gated features as last reported by the bot; null = never reported. */
  features: BotFeatures | null;
}

/** Called by the bot process on a timer; the dashboard reads it via getBotStatus. */
export async function recordBotHeartbeat(guildCount: number, features?: BotFeatures): Promise<void> {
  await retryOnDupKey(() => BotStatusModel.updateOne(
    { key: 'bot' },
    { $set: { last_seen: new Date(), guild_count: guildCount, ...(features ? { features } : {}) } },
    { upsert: true },
  ));
}

/** Called on graceful shutdown so the dashboard flips to offline immediately. */
export async function clearBotHeartbeat(): Promise<void> {
  await BotStatusModel.deleteOne({ key: 'bot' });
}

export async function getBotStatus(now: Date = new Date()): Promise<BotStatus> {
  const doc = (await BotStatusModel.findOne({ key: 'bot' }).lean()) as BotStatusDoc | null;
  if (!doc) return { online: false, last_seen: null, guild_count: 0, features: null };
  return {
    online: now.getTime() - doc.last_seen.getTime() < BOT_OFFLINE_AFTER_MS,
    last_seen: doc.last_seen.toISOString(),
    guild_count: doc.guild_count,
    features: doc.features ?? null,
  };
}
