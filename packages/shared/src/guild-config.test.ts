import { describe, it, expect } from 'vitest';
import { GuildConfigSchema } from './guild-config.js';

describe('GuildConfigSchema', () => {
  it('produces full defaults from empty object', () => {
    const c = GuildConfigSchema.parse({});
    expect(c.language).toBe('ar');
    expect(c.voice).toEqual({
      enabled: true,
      wake_word: 'يا بوت',
      dialect: 'gulf',
      allowed_channel_ids: [],
    });
    expect(c.customs).toEqual({ win_points: 25, loss_points: -10, admin_role_id: null });
    expect(c.quotas).toEqual({ listen_minutes_per_day: 60, ai_questions_per_day: 50 });
  });

  it('rejects invalid dialect', () => {
    expect(() => GuildConfigSchema.parse({ voice: { dialect: 'french' } })).toThrow();
  });

  it('defaults premium to inactive with null overrides', () => {
    const c = GuildConfigSchema.parse({});
    expect(c.premium).toEqual({
      active: false,
      listen_minutes_override: null,
      ai_questions_override: null,
    });
  });
});
