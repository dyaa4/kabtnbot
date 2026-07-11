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
  // Groq Orpheus TTS (Arabic Saudi). One GROQ_API_KEY now covers STT + chat + TTS.
  // Voices: Abdullah, Fahad, Sultan (m); Lulwa, Noura, Aisha (f).
  GROQ_TTS_MODEL: z.string().optional().default('canopylabs/orpheus-arabic-saudi'),
  GROQ_TTS_VOICE: z.string().optional().default('fahad'),
  // English TTS: Orpheus is Arabic-only, so English replies use a separate Groq
  // model/voice (PlayAI). Used when the guild's bot language is English.
  GROQ_TTS_MODEL_EN: z.string().optional().default('playai-tts'),
  GROQ_TTS_VOICE_EN: z.string().optional().default('Fritz-PlayAI'),
  GEMINI_API_KEY: z.string().optional().default(''),
  // ElevenLabs is now an OPTIONAL fallback — only used if a key is still set.
  // Leave all three empty to run TTS purely on Groq Orpheus.
  ELEVENLABS_API_KEY: z.string().optional().default(''),
  ELEVENLABS_VOICE_ID: z.string().optional().default('21m00Tcm4TlvDq8ikWAM'),
  ELEVENLABS_MODEL_ID: z.string().optional().default('eleven_flash_v2_5'),
  // Deploy-level guard for the privileged MessageContent gateway intent — set to 'true'
  // only if a guild's text protection is actually enabled AND the Message Content Intent
  // is turned on in the Discord Developer Portal. See README.
  ENABLE_TEXT_PROTECTION: z.string().optional().default(''),
  // Same privileged-intent guard for the /summarize ("Catch me up") command,
  // which must read message content. Set 'true' only with the Message Content
  // Intent enabled in the Discord Developer Portal.
  ENABLE_SUMMARY: z.string().optional().default(''),
  // Same guard for user-defined TEXT command triggers (flow editor). Voice
  // triggers work regardless — only reading channel messages needs the intent.
  ENABLE_TEXT_COMMANDS: z.string().optional().default(''),
});

export const config = Env.parse(process.env);

export const textProtectionEnabled = config.ENABLE_TEXT_PROTECTION === 'true';
export const summaryEnabled = config.ENABLE_SUMMARY === 'true';
export const textCommandsEnabled = config.ENABLE_TEXT_COMMANDS === 'true';
