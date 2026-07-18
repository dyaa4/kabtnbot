import { consumeAiQuestion, refundAiQuestion, getUsage, incrementListenSeconds } from '@gamebot/db';
import { effectiveQuotas, todayKey } from '@gamebot/shared';
import { getCachedGuildConfig } from './config-cache.js';
import { isGuildPremiumCached } from './premium-cache.js';

export { todayKey };

export async function tryConsumeAiQuestion(guildId: string): Promise<boolean> {
  // Cached read-only config: this runs on every utterance/command, so it must
  // not do a write-upsert per call (getGuildConfig would).
  const [config, premium] = await Promise.all([
    getCachedGuildConfig(guildId),
    isGuildPremiumCached(guildId),
  ]);
  // Consume atomically, refund on overshoot — a check-then-increment would let
  // concurrent questions at the boundary all pass the check and bust the cap.
  const total = await consumeAiQuestion(guildId, todayKey());
  if (total <= effectiveQuotas(config, premium).ai_questions_per_day) return true;
  await refundAiQuestion(guildId, todayKey()).catch(() => {});
  return false;
}

export async function addListenSeconds(guildId: string, seconds: number): Promise<void> {
  if (seconds > 0) await incrementListenSeconds(guildId, Math.ceil(seconds), todayKey());
}

export async function isListenQuotaExceeded(guildId: string): Promise<boolean> {
  const [config, usage, premium] = await Promise.all([
    getCachedGuildConfig(guildId),
    getUsage(guildId, todayKey()),
    isGuildPremiumCached(guildId),
  ]);
  return usage.listen_seconds >= effectiveQuotas(config, premium).listen_minutes_per_day * 60;
}
