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
  GROQ_MODEL: z.string().optional().default('llama-3.1-8b-instant'),
  GEMINI_API_KEY: z.string().optional().default(''),
  ELEVENLABS_API_KEY: z.string().optional().default(''),
  ELEVENLABS_VOICE_ID: z.string().optional().default('21m00Tcm4TlvDq8ikWAM'),
  ELEVENLABS_MODEL_ID: z.string().optional().default('eleven_flash_v2_5'),
  // Deploy-level guard for the privileged MessageContent gateway intent — set to 'true'
  // only if a guild's text protection is actually enabled AND the Message Content Intent
  // is turned on in the Discord Developer Portal. See README.
  ENABLE_TEXT_PROTECTION: z.string().optional().default(''),
});

export const config = Env.parse(process.env);

export const textProtectionEnabled = config.ENABLE_TEXT_PROTECTION === 'true';
