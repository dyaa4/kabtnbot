import { getPremiumLinker, consumeOrganize, refundOrganize, getUsage } from '@gamebot/db';
import { PREMIUM_ORGANIZES_PER_MONTH, monthKey } from '@gamebot/shared';

export interface OrganizeUsage {
  used: number;
  limit: number;
  remaining: number;
}

// Pooled per premium ACCOUNT: every guild linked by the same premium account
// shares one monthly allowance (mirrors the bot's user:<uid> quota pooling), so
// linking more guilds can't multiply the cap. Guilds with no premium linker
// fall back to a guild-keyed row.
async function budgetKey(guildId: string): Promise<string> {
  const linker = await getPremiumLinker(guildId);
  return linker ? `user:${linker}` : guildId;
}

function usageOf(used: number): OrganizeUsage {
  return { used, limit: PREMIUM_ORGANIZES_PER_MONTH, remaining: Math.max(0, PREMIUM_ORGANIZES_PER_MONTH - used) };
}

export async function getOrganizeUsage(guildId: string): Promise<OrganizeUsage> {
  const usage = await getUsage(await budgetKey(guildId), monthKey());
  return usageOf(usage.organizes);
}

/**
 * Atomically consume one generation. Returns { ok: true } when within the cap;
 * otherwise refunds the overshoot and returns the (exhausted) usage. The
 * consume-then-refund order prevents concurrent requests at the boundary from
 * both passing a check-then-increment.
 */
export async function consumeOrganizeQuota(
  guildId: string,
): Promise<{ ok: true } | { ok: false; usage: OrganizeUsage }> {
  const key = await budgetKey(guildId);
  const total = await consumeOrganize(key, monthKey());
  if (total > PREMIUM_ORGANIZES_PER_MONTH) {
    await refundOrganize(key, monthKey()).catch(() => {});
    return { ok: false, usage: usageOf(PREMIUM_ORGANIZES_PER_MONTH) };
  }
  return { ok: true };
}

/** Give back a consumed generation when the AI call itself failed. */
export async function refundOrganizeQuota(guildId: string): Promise<void> {
  await refundOrganize(await budgetKey(guildId), monthKey()).catch(() => {});
}
