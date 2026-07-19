import { describe, it, expect } from 'vitest';
import { GuildConfigSchema } from './guild-config.js';
import { effectiveQuotas, monthKey, PREMIUM_QUOTAS } from './quotas.js';

describe('effectiveQuotas (monthly)', () => {
  it('monthKey is UTC YYYY-MM', () => {
    expect(monthKey()).toMatch(/^\d{4}-\d{2}$/);
  });
  it('returns the configured per-guild quotas', () => {
    const c = GuildConfigSchema.parse({ quotas: { listen_minutes_per_month: 90, ai_questions_per_month: 70 } });
    expect(effectiveQuotas(c)).toEqual({ listen_minutes_per_month: 90, ai_questions_per_month: 70 });
  });
  it('free guilds default to ZERO — the voice assistant is premium-only', () => {
    const c = GuildConfigSchema.parse({});
    expect(effectiveQuotas(c)).toEqual({ listen_minutes_per_month: 0, ai_questions_per_month: 0 });
  });
  it('premium raises limits to at least the premium floor', () => {
    const c = GuildConfigSchema.parse({});
    expect(effectiveQuotas(c, true)).toEqual(PREMIUM_QUOTAS);
  });
  it('premium never reduces an explicitly higher configured quota', () => {
    const c = GuildConfigSchema.parse({ quotas: { listen_minutes_per_month: 9999, ai_questions_per_month: 9 } });
    expect(effectiveQuotas(c, true)).toEqual({
      listen_minutes_per_month: 9999,
      ai_questions_per_month: PREMIUM_QUOTAS.ai_questions_per_month,
    });
  });
});
