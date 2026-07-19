import type { Request, Response, NextFunction } from 'express';
import { getGuildConfig, isGuildLinked } from '@gamebot/db';
import type { DiscordRest } from './discord-rest.js';
import type { Session } from './session.js';
import { decryptToken } from './crypto.js';
import { isSuperAdmin } from './config.js';
import { apiError } from './app.js';

export const MANAGE_GUILD = 1n << 5n;
const TTL_MS = 60_000;

export interface EligibleGuild {
  id: string;
  name: string;
  icon: string | null;
}

const cache = new Map<string, { at: number; value: Promise<unknown> }>();

export function clearAccessCache(): void {
  cache.clear();
}

/**
 * Drop one user's cached guild LIST (the `one:` guard entries stay — a newly
 * joined guild has none yet). Used by /api/guilds?fresh=1 so a freshly invited
 * guild shows up without waiting out the TTL.
 */
export function invalidateGuildListCache(uid: string): void {
  cache.delete(`list:${uid}`);
}

// Cache the in-flight PROMISE, not just its resolved value. A dashboard page load
// fires many guarded endpoints at once; storing the value only after compute()
// resolves lets every concurrent cold-cache request run compute() in lockstep,
// stampeding Discord's tightly rate-limited /users/@me/guilds into a 429. Storing
// the promise immediately collapses that burst onto a single upstream call.
function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = compute();
  cache.set(key, { at: Date.now(), value });
  // Don't let a rejection stick for the whole TTL — evict so the next request
  // retries instead of replaying the cached error.
  void value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

function hasManagePermission(permissions: string): boolean {
  return (BigInt(permissions) & MANAGE_GUILD) === MANAGE_GUILD;
}

async function isEligible(
  rest: DiscordRest,
  session: Session,
  guild: { id: string; permissions: string },
): Promise<boolean> {
  if (!(await rest.getGuild(guild.id))) return false; // bot not a member
  if (hasManagePermission(guild.permissions)) return true;
  const config = await getGuildConfig(guild.id);
  if (!config.admin_role_id) return false;
  const member = await rest.getMember(guild.id, session.uid);
  return member?.roles.includes(config.admin_role_id) ?? false;
}

export function listEligibleGuilds(rest: DiscordRest, session: Session): Promise<EligibleGuild[]> {
  return cached(`list:${session.uid}`, async () => {
    const guilds = await rest.getMyGuilds(decryptToken(session.eat));
    const results = await Promise.all(
      guilds.map(async (g) => ((await isEligible(rest, session, g)) ? { id: g.id, name: g.name, icon: g.icon } : null)),
    );
    return results.filter((g): g is EligibleGuild => g !== null);
  });
}

export function canManageGuild(rest: DiscordRest, session: Session, guildId: string): Promise<boolean> {
  return cached(`one:${session.uid}:${guildId}`, async () => {
    const guilds = await rest.getMyGuilds(decryptToken(session.eat));
    const guild = guilds.find((g) => g.id === guildId);
    if (!guild) return false;
    return isEligible(rest, session, guild);
  });
}

// Premium gate for paid dashboard features: premium belongs to USERS — a
// guild qualifies exactly when someone linked it to their plan (or for the
// super-admin outright). There is no per-guild premium anymore.
export async function hasPremiumAccess(guildId: string, res: { locals: { session?: unknown } }): Promise<boolean> {
  const session = res.locals.session as Session | undefined;
  if (session && isSuperAdmin(session.uid)) return true;
  return isGuildLinked(guildId);
}

export function requireGuildAccess(rest: DiscordRest) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = res.locals.session as Session;
      const allowed = await canManageGuild(rest, session, req.params.guildId);
      if (!allowed) {
        apiError(res, 403, 'FORBIDDEN', 'No access to this guild');
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
