import { describe, it, expect } from 'vitest';
import { GuildConfigSchema } from './guild-config.js';
import { effectiveQuotas, PREMIUM_QUOTAS } from './quotas.js';

describe('effectiveQuotas', () => {
  it('returns the configured per-guild quotas', () => {
    const c = GuildConfigSchema.parse({ quotas: { listen_minutes_per_day: 90, ai_questions_per_day: 70 } });
    expect(effectiveQuotas(c)).toEqual({ listen_minutes_per_day: 90, ai_questions_per_day: 70 });
  });
  it('falls back to defaults when nothing is configured', () => {
    const c = GuildConfigSchema.parse({});
    expect(effectiveQuotas(c).listen_minutes_per_day).toBeGreaterThan(0);
    expect(effectiveQuotas(c).ai_questions_per_day).toBeGreaterThan(0);
  });
  it('premium raises limits to at least the premium floor', () => {
    const c = GuildConfigSchema.parse({});
    expect(effectiveQuotas(c, true)).toEqual(PREMIUM_QUOTAS);
  });
  it('premium never reduces an explicitly higher configured quota', () => {
    const c = GuildConfigSchema.parse({ quotas: { listen_minutes_per_day: 999, ai_questions_per_day: 9 } });
    expect(effectiveQuotas(c, true)).toEqual({
      listen_minutes_per_day: 999,
      ai_questions_per_day: PREMIUM_QUOTAS.ai_questions_per_day,
    });
  });
});
