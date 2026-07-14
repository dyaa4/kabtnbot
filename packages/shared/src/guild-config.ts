import { z } from 'zod';

// Groq Orpheus (Arabic Saudi) TTS voices. Male: fahad, abdullah, sultan.
// Female: noura, lulwa, aisha. Lowercase to match Groq's voice ids.
export const TTS_VOICES = ['fahad', 'abdullah', 'sultan', 'noura', 'lulwa', 'aisha'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

// Bot system-message languages: moderation notices, welcome/farewell
// defaults, command replies, the weekly summary and voice replies.
export const LANGUAGES = ['ar', 'en', 'de', 'tr', 'fr', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

export const GuildConfigSchema = z.object({
  language: z.enum(LANGUAGES).default('ar'),
  admin_role_id: z.string().nullable().default(null),
  voice: z
    .object({
      enabled: z.boolean().default(true),
      wake_word: z.string().min(2).max(30).default('يا كابتن'),
      tts_voice: z.enum(TTS_VOICES).default('fahad'),
      allowed_channel_ids: z.array(z.string()).default([]),
      personality_enabled: z.boolean().default(false),
    })
    .default({}),
  protection: z
    .object({
      enabled: z.boolean().default(false),
      voice_moderation: z.boolean().default(true),
      // false = warn on the first profane word, kick only on a repeat (safer,
      // resists noisy STT false positives). true = kick on the first hit.
      voice_kick_immediately: z.boolean().default(false),
      text_protection: z.boolean().default(false),
      text_timeout: z.boolean().default(false),
      custom_words: z.array(z.string()).max(200).default([]),
      // Any message linking to one of these domains (or a subdomain) is deleted.
      blocked_domains: z.array(z.string()).max(200).default([]),
      // Cross-channel spam: same content posted into several channels within
      // a minute -> delete every copy and DM the sender.
      anti_spam: z.boolean().default(false),
      log_channel_id: z.string().nullable().default(null),
    })
    .default({}),
  welcome: z
    .object({
      enabled: z.boolean().default(false),
      channel_id: z.string().nullable().default(null),
      // '' = use the localized default template at send time (see bot strings).
      // 2000 = Discord's hard per-message limit; the bot truncates after
      // placeholder expansion as a safety net.
      message: z.string().max(2000).default(''),
      banner_url: z.string().url().nullable().default(null),
      auto_role_id: z.string().nullable().default(null),
      farewell_enabled: z.boolean().default(false),
      farewell_message: z.string().max(2000).default(''),
      avatar_x: z.number().min(0).max(1).default(0.5),
      avatar_y: z.number().min(0).max(1).default(0.4),
      avatar_size: z.number().min(0.05).max(0.6).default(0.25),
      show_name: z.boolean().default(true),
    })
    .default({}),
  summary: z
    .object({
      enabled: z.boolean().default(false),
      channel_id: z.string().nullable().default(null),
    })
    .default({}),
  quotas: z
    .object({
      listen_minutes_per_day: z.number().int().positive().default(60),
      ai_questions_per_day: z.number().int().positive().default(50),
    })
    .default({}),
});

export type GuildConfig = z.infer<typeof GuildConfigSchema>;
