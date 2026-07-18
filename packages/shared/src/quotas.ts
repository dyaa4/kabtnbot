import type { GuildConfig } from './guild-config.js';

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Daily limits on guilds linked by a PREMIUM account (per-user premium model).
export const PREMIUM_QUOTAS = {
  listen_minutes_per_day: 360,
  ai_questions_per_day: 500,
} as const;

/** Effective daily limits. A premium-linked guild gets at least the premium
 * limits; an explicitly higher configured quota is never reduced. */
export function effectiveQuotas(config: GuildConfig, premium = false): {
  listen_minutes_per_day: number;
  ai_questions_per_day: number;
} {
  return {
    listen_minutes_per_day: premium
      ? Math.max(config.quotas.listen_minutes_per_day, PREMIUM_QUOTAS.listen_minutes_per_day)
      : config.quotas.listen_minutes_per_day,
    ai_questions_per_day: premium
      ? Math.max(config.quotas.ai_questions_per_day, PREMIUM_QUOTAS.ai_questions_per_day)
      : config.quotas.ai_questions_per_day,
  };
}
