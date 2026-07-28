import { listGuildLinkers, type GuildLinker } from '@gamebot/db';
import { isSuperAdmin } from '../config.js';

// Premium status changes rarely (super-admin grant / guild link), but the
// quota layer asks on every utterance — 60s TTL keeps the DB out of the hot
// path while a fresh premium grant still applies within a minute.
const TTL_MS = 60_000;

const cache = new Map<string, { at: number; value: GuildLinker[] }>();

/**
 * The accounts linking this guild (oldest first). ONE cached lookup feeds every
 * gate below, so a guild is judged from a single consistent snapshot.
 */
export async function getGuildLinkersCached(guildId: string): Promise<GuildLinker[]> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await Promise.resolve().then(() => listGuildLinkers(guildId));
    cache.set(guildId, { at: Date.now(), value });
    return value;
  } catch {
    // DB lookup failed: serve the last known value but DON'T refresh `at` — else
    // a sustained outage keeps re-stamping the stale value and the entry never
    // expires, pinning a since-revoked premium/link gate open indefinitely.
    return hit?.value ?? [];
  }
}

/**
 * Premium gate (voice assistant, quota floor): a PREMIUM account links the
 * guild — or a SUPER-ADMIN does. The super-admin arm mirrors the dashboard,
 * where `premium` is `premiumLinked || isSuperAdmin`: there is no payment flow
 * yet, so the owner's own account carries no premium flag and every voice gate
 * refused them in their own server.
 */
export async function isGuildPremiumCached(guildId: string): Promise<boolean> {
  const linkers = await getGuildLinkersCached(guildId);
  return linkers.some((l) => l.premium_active || isSuperAdmin(l.user_id));
}

/**
 * "Is this guild linked by ANY account" — the free feature gate, as opposed to
 * isGuildPremiumCached which is the premium/quota gate.
 */
export async function isGuildLinkedCached(guildId: string): Promise<boolean> {
  return (await getGuildLinkersCached(guildId)).length > 0;
}

/** Whether a super-admin links this guild → unlimited quotas for everyone in it. */
export async function isSuperAdminGuildCached(guildId: string): Promise<boolean> {
  return (await getGuildLinkersCached(guildId)).some((l) => isSuperAdmin(l.user_id));
}

/**
 * The premium account whose monthly pool this guild draws from (null = none).
 * Quotas are pooled PER ACCOUNT, not per guild — otherwise linking 3 guilds
 * would triple one subscription's budget. Oldest premium linker wins.
 */
export async function getPremiumOwnerCached(guildId: string): Promise<string | null> {
  const linkers = await getGuildLinkersCached(guildId);
  return linkers.find((l) => l.premium_active)?.user_id ?? null;
}

export function clearPremiumCache(): void {
  cache.clear();
}
