import { describe, it, expect } from 'vitest';
import { GuildConfigSchema } from './guild-config.js';

describe('GuildConfigSchema', () => {
  it('has the pivoted default shape', () => {
    const c = GuildConfigSchema.parse({});
    expect(c.admin_role_id).toBeNull();
    expect(c.voice.wake_word).toBe('يا كابتن');
    expect(c.voice.personality_enabled).toBe(false);
    expect(c.protection).toEqual({
      enabled: false,
      voice_moderation: true,
      text_protection: false,
      custom_words: [],
      allowed_domains: [],
      log_channel_id: null,
    });
    expect(c.welcome).toEqual({
      enabled: false,
      channel_id: null,
      message: 'أهلاً {user} في {server}! 🎮',
      banner_url: null,
      avatar_x: 0.5,
      avatar_y: 0.4,
      avatar_size: 0.25,
      show_name: true,
    });
    expect('customs' in c).toBe(false);
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
