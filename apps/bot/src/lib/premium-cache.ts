import { isGuildLinked, isGuildPremium } from '@gamebot/db';

// Premium status changes rarely (super-admin grant / guild link), but the
// quota layer asks on every utterance — 60s TTL keeps the DB out of the hot
// path while a fresh premium grant still applies within a minute.
const TTL_MS = 60_000;

const cache = new Map<string, { at: number; value: boolean }>();

export async function isGuildPremiumCached(guildId: string): Promise<boolean> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  // Promise.resolve().then also catches sync throws (e.g. partial db mocks in
  // tests); on failure keep the last known value rather than flapping to free.
  const value = await Promise.resolve()
    .then(() => isGuildPremium(guildId))
    .catch(() => hit?.value ?? false);
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

const linkedCache = new Map<string, { at: number; value: boolean }>();

/**
 * "Is this guild linked by ANY account" — the feature gate (voice assistant),
 * as opposed to isGuildPremiumCached which is the QUOTA gate (premium linker).
 */
export async function isGuildLinkedCached(guildId: string): Promise<boolean> {
  const hit = linkedCache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await Promise.resolve()
    .then(() => isGuildLinked(guildId))
    .catch(() => hit?.value ?? false);
  linkedCache.set(guildId, { at: Date.now(), value });
  return value;
}

export function clearPremiumCache(): void {
  cache.clear();
  linkedCache.clear();
}
