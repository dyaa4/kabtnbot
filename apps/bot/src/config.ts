import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { z } from 'zod';

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
  GEMINI_API_KEY: z.string().optional().default(''),
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
});

export const config = Env.parse(process.env);

export const textProtectionEnabled = config.ENABLE_TEXT_PROTECTION !== 'false';
export const summaryEnabled = config.ENABLE_SUMMARY !== 'false';
export const textCommandsEnabled = config.ENABLE_TEXT_COMMANDS !== 'false';
export const chatLogEnabled = config.ENABLE_CHAT_LOG !== 'false';

const superAdminIds = new Set(
  config.SUPER_ADMIN_IDS.split(',').map((s) => s.trim()).filter(Boolean),
);
/** Whether a Discord user id belongs to a super-admin (unlimited voice quotas). */
export function isSuperAdmin(uid: string | null | undefined): boolean {
  return uid != null && superAdminIds.has(uid);
}
