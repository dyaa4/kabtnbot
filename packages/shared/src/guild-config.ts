import { z } from 'zod';

// OpenAI voice ids — shared by the realtime conversation voice and the
// verbatim TTS announcements. All are multilingual.
export const TTS_VOICES = [
  'marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse',
] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

// Bot system-message languages: moderation notices, welcome/farewell
// defaults, command replies, the weekly summary and voice replies.
export const LANGUAGES = ['ar', 'en', 'de', 'tr', 'fr', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

// Arabic voice dialects for the live assistant. When the guild language is
// Arabic AND ElevenLabs is configured with a voice id for the chosen dialect,
// the answer session speaks that dialect via ElevenLabs instead of the
// OpenAI Realtime audio voice (see apps/bot elevenlabs-tts). msa = Modern
// Standard Arabic (the safe default when no dialect voice is set up).
export const DIALECTS = ['msa', 'gulf', 'egyptian', 'levantine'] as const;
export type Dialect = (typeof DIALECTS)[number];

export const GuildConfigSchema = z.object({
  language: z.enum(LANGUAGES).default('ar'),
  admin_role_id: z.string().nullable().default(null),
  voice: z
    .object({
      enabled: z.boolean().default(true),
      wake_word: z.string().min(2).max(30).default('يا كابتن'),
      // .catch self-heals guilds that still store a pre-migration Orpheus
      // voice id ("fahad" etc.) — they coerce to the default on read; the web
      // PATCH route still validates strictly against the current enum.
      tts_voice: z.enum(TTS_VOICES).default('marin').catch('marin'),
      // Arabic-only spoken dialect. Applies solely to guilds with language
      // 'ar' and only when ElevenLabs has a voice id for the choice; otherwise
      // ignored and the OpenAI Realtime voice is used. .catch self-heals any
      // stale/unknown value to MSA on read.
      dialect: z.enum(DIALECTS).default('msa').catch('msa'),
      allowed_channel_ids: z.array(z.string()).default([]),
      personality_enabled: z.boolean().default(false),
      // Conversation window: after a wake-word question, the SAME speaker can
      // keep talking to the bot without repeating the wake word for this many
      // seconds. Only wake-word utterances open/extend the window — follow-ups
      // deliberately don't, so a noise-hallucinated wake word can't start a
      // self-sustaining answer loop. 0 = off (wake word required every time).
      follow_up_seconds: z.number().int().min(0).max(120).default(0),
      // Focus lock: once a speaker addresses the bot, it commits to THAT person
      // and ignores everyone else (even their wake word) until the focused
      // speaker goes quiet for the focus window — then the next person can
      // engage. Keeps the bot from ping-ponging between people in a busy room.
      focus_active_speaker: z.boolean().default(true),
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
      // null = fall back to the welcome channel (pre-existing behavior).
      farewell_channel_id: z.string().nullable().default(null),
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
      // MONTHLY budgets (owner decision 2026-07-19; formerly per-day). The
      // free default is 0: the voice assistant is premium-only — premium-
      // linked guilds get PREMIUM_QUOTAS via effectiveQuotas. A positive
      // value here is a manual per-guild grant that is never reduced.
      listen_minutes_per_month: z.number().int().min(0).default(0),
      ai_questions_per_month: z.number().int().min(0).default(0),
    })
    .default({}),
  tickets: z
    .object({
      enabled: z.boolean().default(false),
      // Category under which ticket channels are created.
      category_id: z.string().nullable().default(null),
      // Role that can see and manage tickets.
      support_role_id: z.string().nullable().default(null),
      // Channel to log ticket transcripts.
      log_channel_id: z.string().nullable().default(null),
      // Channel where the ticket panel (embed + button) is posted.
      panel_channel_id: z.string().nullable().default(null),
      // Welcome message sent inside a new ticket channel.
      welcome_message: z.string().max(2000).default(''),
      // Close message sent when a ticket is closed.
      close_message: z.string().max(2000).default(''),
      // Auto-close tickets after this many hours of inactivity (0 = off).
      auto_close_hours: z.number().int().min(0).max(168).default(0),
    })
    .default({}),
});

export type GuildConfig = z.infer<typeof GuildConfigSchema>;
