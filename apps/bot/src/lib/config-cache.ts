import { getGuildConfigRead } from '@gamebot/db';
import type { GuildConfig } from '@gamebot/shared';

// Short TTL so dashboard changes (e.g. new blocklist words) apply within a few
// seconds — no restart needed — while still shielding the DB from a read on
// literally every message/utterance.
const TTL_MS = 3_000;

const cache = new Map<string, { at: number; value: GuildConfig }>();

/**
 * Short-TTL cache in front of getGuildConfigRead for hot paths (per-message text
 * protection, per-utterance voice moderation). getGuildConfigRead is a read-only
 * findOne (no write), so config edits propagate within TTL_MS with no write load.
 * Slash-command handlers should keep using getGuildConfig directly.
 */
export async function getCachedGuildConfig(guildId: string): Promise<GuildConfig> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await getGuildConfigRead(guildId);
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

export function clearConfigCache(): void {
  cache.clear();
}
