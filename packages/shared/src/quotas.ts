import type { GuildConfig } from './guild-config.js';

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Month bucket for QUOTA accounting (YYYY-MM). Stats/snapshots keep todayKey. */
export function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

// MONTHLY limits on guilds linked by a PREMIUM account (per-user premium
// model). Chosen for a ~$7/month/guild cost ceiling (owner decision
// 2026-07-19) — the old per-day quotas ceilinged at ~$160/month.
export const PREMIUM_QUOTAS = {
  listen_minutes_per_month: 600,
  ai_questions_per_month: 600,
} as const;

/** Effective MONTHLY limits. A premium-linked guild gets at least the premium
 * limits; an explicitly higher configured quota is never reduced. Free guilds
 * default to 0 — the voice assistant is a premium-only feature. */
export function effectiveQuotas(config: GuildConfig, premium = false): {
  listen_minutes_per_month: number;
  ai_questions_per_month: number;
} {
  return {
    listen_minutes_per_month: premium
      ? Math.max(config.quotas.listen_minutes_per_month, PREMIUM_QUOTAS.listen_minutes_per_month)
      : config.quotas.listen_minutes_per_month,
    ai_questions_per_month: premium
      ? Math.max(config.quotas.ai_questions_per_month, PREMIUM_QUOTAS.ai_questions_per_month)
      : config.quotas.ai_questions_per_month,
  };
}
