import type { GuildConfig } from './guild-config.js';

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Month bucket for QUOTA accounting (YYYY-MM). Stats/snapshots keep todayKey. */
export function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

// MONTHLY limits on guilds linked by a PREMIUM account (per-user premium
// model). Sized so ONE fully-exhausting account costs ~$2.60/month at the
// 2026-07-26 provider prices (owner decision: a $15 subscription was too much
// for the market, so the ceiling had to come down, not the price up):
//   STT  300 min  = 5h x $0.22/h (ElevenLabs Scribe)      ~$1.10
//   TTS  200 answers x ~80 chars (two-sentence replies)   ~$1.36
//   LLM  200 answers + intent calls (Groq llama-3.3-70b)  ~$0.17
// The earlier 600/600 ceilinged at ~$10-21 — sustainable only above a $15
// price point. Raising these numbers again means re-running that arithmetic.
export const PREMIUM_QUOTAS = {
  listen_minutes_per_month: 300,
  ai_questions_per_month: 200,
} as const;

/** AI channel-organizer generations allowed per month, pooled per premium
 * account (a premium-only feature — free accounts get none). */
export const PREMIUM_ORGANIZES_PER_MONTH = 5;

/** Effective MONTHLY limits. A premium-linked guild gets at least the premium
 * limits; an explicitly higher configured quota is never reduced. Free guilds
 * default to 0 — the voice assistant is a premium-only feature. */
export function effectiveQuotas(config: GuildConfig, premium = false): {
  listen_minutes_per_month: number;
  ai_questions_per_month: number;
} {
  return {
    listen_minutes_per_month: premium
      ? Math.max(config.quotas.listen_minutes_per_month, PREMIUM_QUOTAS.listen_minutes_per_month)
      : config.quotas.listen_minutes_per_month,
    ai_questions_per_month: premium
      ? Math.max(config.quotas.ai_questions_per_month, PREMIUM_QUOTAS.ai_questions_per_month)
      : config.quotas.ai_questions_per_month,
  };
}
