import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();

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
});

export const config = Env.parse(process.env);
