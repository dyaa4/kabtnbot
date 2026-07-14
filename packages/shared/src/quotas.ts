import type { GuildConfig } from './guild-config.js';

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Effective daily limits — the guild's configured quotas. (Premium moved to
 * the per-USER linking model; per-guild quota overrides went with it.) */
export function effectiveQuotas(config: GuildConfig): {
  listen_minutes_per_day: number;
  ai_questions_per_day: number;
} {
  return {
    listen_minutes_per_day: config.quotas.listen_minutes_per_day,
    ai_questions_per_day: config.quotas.ai_questions_per_day,
  };
}
