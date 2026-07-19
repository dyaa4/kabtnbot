import { consumeAiQuestion, refundAiQuestion, getUsage, incrementListenSeconds } from '@gamebot/db';
import { effectiveQuotas, monthKey, todayKey } from '@gamebot/shared';
import { getCachedGuildConfig } from './config-cache.js';
import { isGuildPremiumCached } from './premium-cache.js';

export { todayKey };

// Quota accounting is MONTHLY (owner decision 2026-07-19): usage rows are
// keyed by monthKey() so the same atomic consume/refund machinery gives a
// calendar-month budget. Daily stats/snapshots elsewhere keep todayKey.

export async function tryConsumeAiQuestion(guildId: string): Promise<boolean> {
  // Cached read-only config: this runs on every utterance/command, so it must
  // not do a write-upsert per call (getGuildConfig would).
  const [config, premium] = await Promise.all([
    getCachedGuildConfig(guildId),
    isGuildPremiumCached(guildId),
  ]);
  // Consume atomically, refund on overshoot — a check-then-increment would let
  // concurrent questions at the boundary all pass the check and bust the cap.
  const total = await consumeAiQuestion(guildId, monthKey());
  if (total <= effectiveQuotas(config, premium).ai_questions_per_month) return true;
  await refundAiQuestion(guildId, monthKey()).catch(() => {});
  return false;
}

export async function addListenSeconds(guildId: string, seconds: number): Promise<void> {
  if (seconds > 0) await incrementListenSeconds(guildId, Math.ceil(seconds), monthKey());
}

export async function isListenQuotaExceeded(guildId: string): Promise<boolean> {
  const [config, usage, premium] = await Promise.all([
    getCachedGuildConfig(guildId),
    getUsage(guildId, monthKey()),
    isGuildPremiumCached(guildId),
  ]);
  return usage.listen_seconds >= effectiveQuotas(config, premium).listen_minutes_per_month * 60;
}
