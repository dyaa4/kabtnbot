import { getPremiumLinker, isGuildLinked, isGuildPremium } from '@gamebot/db';

// Premium status changes rarely (super-admin grant / guild link), but the
// quota layer asks on every utterance — 60s TTL keeps the DB out of the hot
// path while a fresh premium grant still applies within a minute.
const TTL_MS = 60_000;

const cache = new Map<string, { at: number; value: boolean }>();

export async function isGuildPremiumCached(guildId: string): Promise<boolean> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await Promise.resolve().then(() => isGuildPremium(guildId));
    cache.set(guildId, { at: Date.now(), value });
    return value;
  } catch {
    // DB lookup failed: serve the last known value but DON'T refresh `at` — else
    // a sustained outage keeps re-stamping the stale value and the entry never
    // expires, pinning a since-revoked premium/link gate open indefinitely.
    return hit?.value ?? false;
  }
}

const linkedCache = new Map<string, { at: number; value: boolean }>();

/**
 * "Is this guild linked by ANY account" — the feature gate (voice assistant),
 * as opposed to isGuildPremiumCached which is the QUOTA gate (premium linker).
 */
export async function isGuildLinkedCached(guildId: string): Promise<boolean> {
  const hit = linkedCache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await Promise.resolve().then(() => isGuildLinked(guildId));
    linkedCache.set(guildId, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? false; // serve stale without re-stamping `at` (see above)
  }
}

const ownerCache = new Map<string, { at: number; value: string | null }>();

/**
 * The premium account whose monthly quota pool this guild draws from
 * (null = no premium link). Cached like the other premium lookups: the
 * quota layer asks on every utterance.
 */
export async function getPremiumOwnerCached(guildId: string): Promise<string | null> {
  const hit = ownerCache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await Promise.resolve().then(() => getPremiumLinker(guildId));
    ownerCache.set(guildId, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? null; // serve stale without re-stamping `at` (see above)
  }
}

export function clearPremiumCache(): void {
  cache.clear();
  linkedCache.clear();
  ownerCache.clear();
}
