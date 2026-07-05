import { z } from 'zod';

export const DIALECTS = ['gulf', 'syrian', 'egyptian', 'msa'] as const;
export type Dialect = (typeof DIALECTS)[number];

export const GuildConfigSchema = z.object({
  language: z.literal('ar').default('ar'),
  admin_role_id: z.string().nullable().default(null),
  voice: z
    .object({
      enabled: z.boolean().default(true),
      wake_word: z.string().min(2).max(30).default('يا كابتن'),
      dialect: z.enum(DIALECTS).default('gulf'),
      allowed_channel_ids: z.array(z.string()).default([]),
      personality_enabled: z.boolean().default(false),
    })
    .default({}),
  protection: z
    .object({
      enabled: z.boolean().default(false),
      voice_moderation: z.boolean().default(true),
      text_protection: z.boolean().default(false),
      custom_words: z.array(z.string()).max(200).default([]),
      allowed_domains: z.array(z.string()).max(200).default([]),
      log_channel_id: z.string().nullable().default(null),
    })
    .default({}),
  welcome: z
    .object({
      enabled: z.boolean().default(false),
      channel_id: z.string().nullable().default(null),
      message: z.string().max(500).default('أهلاً {user} في {server}! 🎮'),
      banner_url: z.string().url().nullable().default(null),
      avatar_x: z.number().min(0).max(1).default(0.5),
      avatar_y: z.number().min(0).max(1).default(0.4),
      avatar_size: z.number().min(0.05).max(0.6).default(0.25),
      show_name: z.boolean().default(true),
    })
    .default({}),
  quotas: z
    .object({
      listen_minutes_per_day: z.number().int().positive().default(60),
      ai_questions_per_day: z.number().int().positive().default(50),
    })
    .default({}),
  premium: z
    .object({
      active: z.boolean().default(false),
      listen_minutes_override: z.number().int().positive().nullable().default(null),
      ai_questions_override: z.number().int().positive().nullable().default(null),
    })
    .default({}),
});

export type GuildConfig = z.infer<typeof GuildConfigSchema>;
