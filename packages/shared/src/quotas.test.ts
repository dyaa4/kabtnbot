import { describe, it, expect } from 'vitest';
import { GuildConfigSchema } from './guild-config.js';
import { effectiveQuotas, todayKey } from './quotas.js';

describe('effectiveQuotas', () => {
  it('returns base quotas when premium inactive', () => {
    const c = GuildConfigSchema.parse({});
    expect(effectiveQuotas(c)).toEqual({ listen_minutes_per_day: 60, ai_questions_per_day: 50 });
  });

  it('returns overrides when premium active', () => {
    const c = GuildConfigSchema.parse({
      premium: { active: true, listen_minutes_override: 300, ai_questions_override: 500 },
    });
    expect(effectiveQuotas(c)).toEqual({ listen_minutes_per_day: 300, ai_questions_per_day: 500 });
  });

  it('falls back per-field when an override is null', () => {
    const c = GuildConfigSchema.parse({ premium: { active: true, ai_questions_override: 500 } });
    expect(effectiveQuotas(c)).toEqual({ listen_minutes_per_day: 60, ai_questions_per_day: 500 });
  });
});

describe('todayKey', () => {
  it('is UTC YYYY-MM-DD', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
