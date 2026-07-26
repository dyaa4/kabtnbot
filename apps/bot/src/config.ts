import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { z } from 'zod';
import type { Dialect } from '@gamebot/shared';

// pnpm --filter runs package scripts with CWD=apps/bot, so the repo-root .env
// must be resolved relative to this file (same depth from src/ and dist/),
// not the working directory.
export const ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
dotenv.config({ path: ENV_FILE });

const Env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional().default(''),
  MONGODB_URI: z.string().min(1),
  GROQ_API_KEY: z.string().optional().default(''),
  // 8b-instant produces broken, incoherent Arabic (esp. colloquial dialects);
  // 70b-versatile is far stronger at Arabic and still fast on Groq. See voice-ai.
  GROQ_MODEL: z.string().optional().default('llama-3.3-70b-versatile'),
  // Groq Whisper for the firehose STT when VOICE_ENGINE=groq. Turbo is the
  // cheapest/fastest Whisper on Groq and handles Arabic well.
  GROQ_STT_MODEL: z.string().optional().default('whisper-large-v3-turbo'),
  // OpenAI powers the whole voice path: one Realtime session per guild for
  // STT + conversation + spoken answers, REST TTS for verbatim announcements
  // (/speak, warn/kick lines, scheduler) that must never be paraphrased.
  OPENAI_API_KEY: z.string().optional().default(''),
  // Realtime conversation model. NOTE: an inaccessible model returns a WS
  // `model_not_found` that hard-loops the reconnect — if voice logs show that,
  // fall back to the always-accessible `gpt-realtime-mini` via env or here.
  OPENAI_REALTIME_MODEL: z.string().optional().default('gpt-realtime-2'),
  OPENAI_REALTIME_VOICE: z.string().optional().default('marin'),
  // gpt-4o-*-transcribe supports a decode prompt (wake word + trigger phrases);
  // gpt-realtime-whisper/whisper-1 do NOT — realtime.ts omits it for those.
  // mini is the accessible default: the full gpt-4o-transcribe requires project
  // access this OpenAI project doesn't have (transcription failed:
  // does-not-have-access). Opt into it via env once the account is granted it.
  OPENAI_TRANSCRIBE_MODEL: z.string().optional().default('gpt-4o-mini-transcribe'),
  OPENAI_TTS_MODEL: z.string().optional().default('gpt-4o-mini-tts'),
  // ElevenLabs powers per-dialect Arabic voices for the LIVE assistant only
  // (Arabic guilds). OpenAI Realtime stays the STT/LLM/VAD brain but emits
  // TEXT; ElevenLabs synthesizes that text with the dialect's voice id. Unset
  // key or unset dialect voice id → the guild silently falls back to the
  // OpenAI Realtime audio voice. Turbo v2.5 is multilingual + low-latency,
  // which matters because synthesis only starts after the full answer text.
  ELEVENLABS_API_KEY: z.string().optional().default(''),
  ELEVENLABS_MODEL: z.string().optional().default('eleven_turbo_v2_5'),
  // ElevenLabs Scribe is also the default STT (see VOICE_STT): stronger Arabic
  // than Whisper and it takes the trigger terms as real `keyterms` biasing
  // instead of a decode prompt. $0.22/h vs Groq turbo's $0.04/h.
  ELEVENLABS_STT_MODEL: z.string().optional().default('scribe_v2'),
  // Fallback voice for non-Arabic languages and for Arabic dialects with no
  // dedicated voice id. Multilingual (eleven_turbo_v2_5 speaks all langs).
  ELEVENLABS_VOICE_DEFAULT: z.string().optional().default(''),
  ELEVENLABS_VOICE_MSA: z.string().optional().default(''),
  ELEVENLABS_VOICE_GULF: z.string().optional().default(''),
  ELEVENLABS_VOICE_EGYPTIAN: z.string().optional().default(''),
  ELEVENLABS_VOICE_LEVANTINE: z.string().optional().default(''),
  // Voice engine for the assistant. 'groq' (default): Groq Whisper STT + Groq
  // Llama answer + ElevenLabs voice — NO OpenAI. 'openai': the Realtime
  // AnswerSession (needs OpenAI credit). Groq mode runs inside the V2 firehose.
  VOICE_ENGINE: z.string().optional().default('groq'),
  // Transcription provider, independent of VOICE_ENGINE: 'elevenlabs' | 'groq'
  // | 'openai'. Empty follows the engine (groq → elevenlabs, openai → openai).
  // Exists because a provider can revoke model access without warning — Groq
  // blocked whisper-large-v3-turbo at the project level and the whole voice
  // path went deaf; this flips STT in one env change, no redeploy.
  VOICE_STT: z.string().optional().default(''),
  // Deploy-level guard for the privileged MessageContent gateway intent — set to 'true'
  // Text features are ON by default (opt-OUT: set 'false' to disable one).
  // They need the privileged Message Content Intent; if the intent is missing
  // in the Discord Developer Portal, startup falls back to a content-less
  // login (see index.ts) instead of crashing, and these features stay dormant.
  ENABLE_TEXT_PROTECTION: z.string().optional().default(''),
  // /summarize ("Catch me up") — reads message content.
  ENABLE_SUMMARY: z.string().optional().default(''),
  // User-defined TEXT command triggers (flow editor). Voice triggers work
  // regardless — only reading channel messages needs the intent.
  ENABLE_TEXT_COMMANDS: z.string().optional().default(''),
  // Premium chat log (stores recent messages, 7-day TTL).
  ENABLE_CHAT_LOG: z.string().optional().default(''),
  // Comma-separated Discord user ids of super-admins (the owner). Guilds whose
  // premium account is a super-admin get UNLIMITED voice quotas (listen + AI) —
  // mirrors the web dashboard's super-admin bypass, so the owner can use/test
  // the bot without the per-account monthly cap. Keep in sync with the web
  // service's SUPER_ADMIN_IDS.
  SUPER_ADMIN_IDS: z.string().optional().default(''),
  // The rearchitected voice pipeline (VOICE_V2): a REST transcription firehose
  // for all speakers (moderation + wake word) + a separate server-VAD answer
  // session for the active speaker only. ON by default (owner decision); set
  // VOICE_V2=false to fall back to the old single-session pipeline instantly
  // (env flip, no redeploy needed).
  VOICE_V2: z.string().optional().default(''),
});

export const config = Env.parse(process.env);

export const textProtectionEnabled = config.ENABLE_TEXT_PROTECTION !== 'false';
export const summaryEnabled = config.ENABLE_SUMMARY !== 'false';
export const textCommandsEnabled = config.ENABLE_TEXT_COMMANDS !== 'false';
export const chatLogEnabled = config.ENABLE_CHAT_LOG !== 'false';
/** The rearchitected voice pipeline — ON unless VOICE_V2=false. See above. */
export const voiceV2Enabled = config.VOICE_V2 !== 'false';
/** Groq voice engine (Whisper + Llama + ElevenLabs, no OpenAI) — the default;
 * set VOICE_ENGINE=openai to use the OpenAI Realtime answer session instead. */
export const voiceEngineGroq = config.VOICE_ENGINE !== 'openai';

export type SttProvider = 'elevenlabs' | 'groq' | 'openai';
/**
 * Which provider transcribes utterances. VOICE_STT wins when it names a known
 * provider; otherwise the voice engine decides (groq engine → ElevenLabs
 * Scribe, which needs no OpenAI and no Groq model access).
 */
export const sttProvider: SttProvider = (() => {
  const want = config.VOICE_STT.trim().toLowerCase();
  if (want === 'elevenlabs' || want === 'groq' || want === 'openai') return want;
  return voiceEngineGroq ? 'elevenlabs' : 'openai';
})();

/**
 * The ElevenLabs voice id configured for an Arabic dialect, or '' if none is
 * set up. Empty means the guild keeps the OpenAI Realtime voice (fail-open).
 */
export function dialectVoiceId(dialect: Dialect): string {
  switch (dialect) {
    case 'gulf': return config.ELEVENLABS_VOICE_GULF;
    case 'egyptian': return config.ELEVENLABS_VOICE_EGYPTIAN;
    case 'levantine': return config.ELEVENLABS_VOICE_LEVANTINE;
    case 'msa': return config.ELEVENLABS_VOICE_MSA;
  }
}

const superAdminIds = new Set(
  config.SUPER_ADMIN_IDS.split(',').map((s) => s.trim()).filter(Boolean),
);
/** Whether a Discord user id belongs to a super-admin (unlimited voice quotas). */
export function isSuperAdmin(uid: string | null | undefined): boolean {
  return uid != null && superAdminIds.has(uid);
}

/** How many super-admin ids this SERVICE knows — logged at boot. Setting
 * SUPER_ADMIN_IDS on the web service only (the bot is a separate Railway
 * service with its own variables) left the bot refusing the owner with
 * "the AI questions ran out" and no hint why. */
export const superAdminCount = superAdminIds.size;
