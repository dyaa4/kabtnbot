import { describe, it, expect } from 'vitest';
import { GuildConfigSchema, LANGUAGES } from './guild-config.js';

describe('GuildConfigSchema', () => {
  it('accepts every supported language and defaults to Arabic', () => {
    expect(GuildConfigSchema.parse({}).language).toBe('ar');
    for (const lang of LANGUAGES) {
      expect(GuildConfigSchema.parse({ language: lang }).language).toBe(lang);
    }
    expect(() => GuildConfigSchema.parse({ language: 'xx' })).toThrow();
  });

  it('defaults welcome/farewell messages to empty (= use localized default at send time)', () => {
    const c = GuildConfigSchema.parse({});
    expect(c.welcome.message).toBe('');
    expect(c.welcome.farewell_message).toBe('');
  });

  it('has the pivoted default shape', () => {
    const c = GuildConfigSchema.parse({});
    expect(c.admin_role_id).toBeNull();
    expect(c.voice.wake_word).toBe('يا كابتن');
    expect(c.voice.tts_voice).toBe('marin');
    expect(c.voice.personality_enabled).toBe(false);
    expect(c.voice.follow_up_seconds).toBe(0);
    expect(c.voice.focus_active_speaker).toBe(true);
    expect(c.voice.dialect).toBe('msa');
    expect(c.protection).toEqual({
      enabled: false,
      voice_moderation: true,
      voice_kick_immediately: false,
      text_protection: false,
      text_timeout: false,
      custom_words: [],
      blocked_domains: [],
      anti_spam: false,
      log_channel_id: null,
    });
    expect(c.welcome).toEqual({
      enabled: false,
      channel_id: null,
      message: '',
      banner_url: null,
      auto_role_id: null,
      farewell_enabled: false,
      farewell_message: '',
      farewell_channel_id: null,
      avatar_x: 0.5,
      avatar_y: 0.4,
      avatar_size: 0.25,
      show_name: true,
    });
    expect('customs' in c).toBe(false);
  });

  it('coerces an unknown tts voice to the default instead of rejecting', () => {
    // Guilds saved before the OpenAI migration still store Orpheus ids —
    // reading their config must self-heal, not crash.
    expect(GuildConfigSchema.parse({ voice: { tts_voice: 'fahad' } }).voice.tts_voice).toBe('marin');
    expect(GuildConfigSchema.parse({ voice: { tts_voice: 'cedar' } }).voice.tts_voice).toBe('cedar');
  });

  it('coerces an unknown dialect to msa and keeps a valid one', () => {
    expect(GuildConfigSchema.parse({ voice: { dialect: 'klingon' } }).voice.dialect).toBe('msa');
    expect(GuildConfigSchema.parse({ voice: { dialect: 'egyptian' } }).voice.dialect).toBe('egyptian');
  });

});
