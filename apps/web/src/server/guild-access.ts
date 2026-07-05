import type { Request, Response, NextFunction } from 'express';
import { getGuildConfig } from '@gamebot/db';
import type { DiscordRest } from './discord-rest.js';
import type { Session } from './session.js';
import { decryptToken } from './crypto.js';
import { apiError } from './app.js';

export const MANAGE_GUILD = 1n << 5n;
const TTL_MS = 60_000;

export interface EligibleGuild {
  id: string;
  name: string;
  icon: string | null;
}

const cache = new Map<string, { at: number; value: unknown }>();

export function clearAccessCache(): void {
  cache.clear();
}

function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value as T);
  return compute().then((value) => {
    cache.set(key, { at: Date.now(), value });
    return value;
  });
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
  if (!config.customs.admin_role_id) return false;
  const member = await rest.getMember(guild.id, session.uid);
  return member?.roles.includes(config.customs.admin_role_id) ?? false;
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
