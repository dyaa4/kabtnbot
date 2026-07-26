import { consumeAiQuestion, refundAiQuestion, getUsage, incrementListenSeconds } from '@gamebot/db';
import { effectiveQuotas, monthKey, todayKey } from '@gamebot/shared';
import { isSuperAdmin } from '../config.js';
import { getCachedGuildConfig } from './config-cache.js';
import { getPremiumOwnerCached } from './premium-cache.js';

export { todayKey };

// Quota accounting is MONTHLY and pooled PER PREMIUM ACCOUNT (owner decision
// 2026-07-19): every guild linked by the same premium account draws from ONE
// `user:<uid>` usage row — otherwise linking 3 guilds would triple a single
// subscription's budget. Guilds without a premium linker fall back to their
// own guild-keyed row (their limit is 0 unless manually granted).

const UNLIMITED = { listen_minutes_per_month: Infinity, ai_questions_per_month: Infinity };

async function quotaContext(guildId: string, speakerId?: string | null) {
  const [config, owner] = await Promise.all([
    // Cached read-only config: this runs on every utterance/command, so it
    // must not do a write-upsert per call (getGuildConfig would).
    getCachedGuildConfig(guildId),
    getPremiumOwnerCached(guildId),
  ]);
  // Super-admin bypass — mirrors the web dashboard's, so the owner can use and
  // test the bot without hitting the per-account monthly cap. TWO ways in:
  //   • the guild's premium account is a super-admin (the owner's own server), or
  //   • the SPEAKER/invoker is a super-admin.
  // The linker check alone was not enough: in any guild linked by an ordinary
  // premium account — or by no premium account at all — the owner was refused
  // with "the AI questions for this server are used up", which is exactly what
  // a super-admin must never hear. Real premium accounts keep the standard
  // quotas; only the ids in SUPER_ADMIN_IDS get past this.
  const unlimited = isSuperAdmin(owner) || isSuperAdmin(speakerId);
  return {
    limits: unlimited ? UNLIMITED : effectiveQuotas(config, owner !== null),
    budgetKey: owner ? `user:${owner}` : guildId,
  };
}

/** @param speakerId who is asking — a super-admin is never charged or refused. */
export async function tryConsumeAiQuestion(guildId: string, speakerId?: string | null): Promise<boolean> {
  const { limits, budgetKey } = await quotaContext(guildId, speakerId);
  // Unlimited (super-admin) accounts have nothing to count — skip the DB
  // consume/refund round-trip on the hot answer path (lower reply latency).
  if (limits.ai_questions_per_month === Infinity) return true;
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

/**
 * Whether the monthly AI allowance is spent, WITHOUT consuming a unit.
 *
 * Speech costs money per character no matter who asked for it, so the paths
 * that speak on their own — scheduled flows, command confirmations — check
 * this before synthesizing. They can't consume a unit: a repeated line is
 * served from the TTS cache for free, and charging for free output would be
 * dishonest. Moderation announcements deliberately do NOT check it; going
 * silent on a kick is a safety regression, and those lines are fixed text
 * that the cache makes free after the first use.
 */
export async function isAiQuotaExhausted(guildId: string, speakerId?: string | null): Promise<boolean> {
  const { limits, budgetKey } = await quotaContext(guildId, speakerId);
  if (limits.ai_questions_per_month === Infinity) return false;
  const usage = await getUsage(budgetKey, monthKey());
  return usage.ai_questions >= limits.ai_questions_per_month;
}

export async function isListenQuotaExceeded(guildId: string): Promise<boolean> {
  const { limits, budgetKey } = await quotaContext(guildId);
  const usage = await getUsage(budgetKey, monthKey());
  return usage.listen_seconds >= limits.listen_minutes_per_month * 60;
}
