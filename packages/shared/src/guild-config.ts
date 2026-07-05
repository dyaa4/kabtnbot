import { z } from 'zod';

export const DIALECTS = ['gulf', 'syrian', 'egyptian', 'msa'] as const;
export type Dialect = (typeof DIALECTS)[number];
export type BalanceMode = 'random' | 'balanced';
export type MatchStatus = 'lobby' | 'in_progress' | 'completed' | 'cancelled';
export type TeamKey = 'a' | 'b';

export const GuildConfigSchema = z.object({
  language: z.literal('ar').default('ar'),
  voice: z
    .object({
      enabled: z.boolean().default(true),
      wake_word: z.string().min(2).max(30).default('يا بوت'),
      dialect: z.enum(DIALECTS).default('gulf'),
      allowed_channel_ids: z.array(z.string()).default([]),
    })
    .default({}),
  customs: z
    .object({
      win_points: z.number().int().default(25),
      loss_points: z.number().int().default(-10),
      admin_role_id: z.string().nullable().default(null),
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
