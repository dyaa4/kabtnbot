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
  SESSION_SECRET: z.string().min(32),
  WEB_PORT: z.coerce.number().default(3000),
  // Strip trailing slashes so `${WEB_BASE_URL}/auth/callback` never produces a
  // double slash — Discord requires the redirect_uri to match exactly.
  WEB_BASE_URL: z.string().default('http://localhost:3000').transform((s) => s.replace(/\/+$/, '')),
  // Optional Discord webhook that receives bot offline/recovery alerts.
  ALERT_WEBHOOK_URL: z.string().optional().default(''),
  // Comma-separated Discord user ids allowed into the owner/super-admin panel.
  SUPER_ADMIN_IDS: z.string().optional().default(''),
  // Tolerated misspelling of the above — see the bot service's config.
  SUPER_ADMINS_IDS: z.string().optional().default(''),
  // Groq powers the AI channel organizer (dashboard, premium). Optional: the
  // feature returns a 503 when unset instead of breaking the rest of the app.
  GROQ_API_KEY: z.string().optional().default(''),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
});

export const config = Env.parse(process.env);

/** Discord user ids with super-admin (owner) access to the admin panel. */
export const superAdminIds = [config.SUPER_ADMIN_IDS, config.SUPER_ADMINS_IDS]
  .flatMap((v) => v.split(',').map((s) => s.trim()))
  .filter(Boolean);

export function isSuperAdmin(uid: string): boolean {
  return superAdminIds.includes(uid);
}
