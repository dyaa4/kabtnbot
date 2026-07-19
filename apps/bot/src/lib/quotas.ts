import { consumeAiQuestion, refundAiQuestion, getUsage, incrementListenSeconds } from '@gamebot/db';
import { effectiveQuotas, monthKey, todayKey } from '@gamebot/shared';
import { getCachedGuildConfig } from './config-cache.js';
import { getPremiumOwnerCached } from './premium-cache.js';

export { todayKey };

// Quota accounting is MONTHLY and pooled PER PREMIUM ACCOUNT (owner decision
// 2026-07-19): every guild linked by the same premium account draws from ONE
// `user:<uid>` usage row — otherwise linking 3 guilds would triple a single
// subscription's budget. Guilds without a premium linker fall back to their
// own guild-keyed row (their limit is 0 unless manually granted).

async function quotaContext(guildId: string) {
  const [config, owner] = await Promise.all([
    // Cached read-only config: this runs on every utterance/command, so it
    // must not do a write-upsert per call (getGuildConfig would).
    getCachedGuildConfig(guildId),
    getPremiumOwnerCached(guildId),
  ]);
  return {
    limits: effectiveQuotas(config, owner !== null),
    budgetKey: owner ? `user:${owner}` : guildId,
  };
}

export async function tryConsumeAiQuestion(guildId: string): Promise<boolean> {
  const { limits, budgetKey } = await quotaContext(guildId);
  // Consume atomically, refund on overshoot — a check-then-increment would let
  // concurrent questions at the boundary all pass the check and bust the cap.
  const total = await consumeAiQuestion(budgetKey, monthKey());
  if (total <= limits.ai_questions_per_month) return true;
  await refundAiQuestion(budgetKey, monthKey()).catch(() => {});
  return false;
}

export async function addListenSeconds(guildId: string, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  const { budgetKey } = await quotaContext(guildId);
  await incrementListenSeconds(budgetKey, Math.ceil(seconds), monthKey());
}

export async function isListenQuotaExceeded(guildId: string): Promise<boolean> {
  const { limits, budgetKey } = await quotaContext(guildId);
  const usage = await getUsage(budgetKey, monthKey());
  return usage.listen_seconds >= limits.listen_minutes_per_month * 60;
}
