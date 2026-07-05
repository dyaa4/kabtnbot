import { getGuildConfig } from '@gamebot/db';
import type { GuildConfig } from '@gamebot/shared';

const TTL_MS = 15_000;

const cache = new Map<string, { at: number; value: GuildConfig }>();

/**
 * Short-TTL cache in front of getGuildConfig for hot paths (per-message text protection,
 * per-utterance voice moderation) — getGuildConfig is a findOneAndUpdate (a write) on every
 * call, so calling it unconditionally on every message/utterance is unnecessary DB load.
 * Slash-command handlers should keep using getGuildConfig directly for fresh reads.
 */
export async function getCachedGuildConfig(guildId: string): Promise<GuildConfig> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await getGuildConfig(guildId);
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

export function clearConfigCache(): void {
  cache.clear();
}
