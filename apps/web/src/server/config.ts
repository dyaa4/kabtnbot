import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { z } from 'zod';

export const ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env');
dotenv.config({ path: ENV_FILE });

const Env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  WEB_PORT: z.coerce.number().default(3000),
  WEB_BASE_URL: z.string().default('http://localhost:3000'),
});

export const config = Env.parse(process.env);
