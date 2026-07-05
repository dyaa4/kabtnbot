import type { GuildConfig } from './guild-config.js';

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Effective daily limits: premium overrides apply per-field when premium is active. */
export function effectiveQuotas(config: GuildConfig): {
  listen_minutes_per_day: number;
  ai_questions_per_day: number;
} {
  const { quotas, premium } = config;
  if (!premium.active) {
    return {
      listen_minutes_per_day: quotas.listen_minutes_per_day,
      ai_questions_per_day: quotas.ai_questions_per_day,
    };
  }
  return {
    listen_minutes_per_day: premium.listen_minutes_override ?? quotas.listen_minutes_per_day,
    ai_questions_per_day: premium.ai_questions_override ?? quotas.ai_questions_per_day,
  };
}
