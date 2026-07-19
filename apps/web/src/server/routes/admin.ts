import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  listActiveGuilds, setGuildBlocked, recordGuildLeave,
  setUserPremium, getUserPlan, listUserAccounts, setUserBlocked, updateUserIdentity,
} from '@gamebot/db';
import type { DiscordRest } from '../discord-rest.js';
import type { Session } from '../session.js';
import { requireSession } from '../session.js';
import { isSuperAdmin } from '../config.js';
import { apiError } from '../app.js';

function requireSuperAdmin(_req: Request, res: Response, next: NextFunction): void {
  const s = res.locals.session as Session;
  if (!isSuperAdmin(s.uid)) {
    apiError(res, 403, 'FORBIDDEN', 'Not a super admin');
    return;
  }
  next();
}

export function adminRouter(rest: DiscordRest): Router {
  const router = Router();
  router.use(requireSession);

  // Any logged-in user may check this — it drives whether the admin nav link shows.
  router.get('/me', (_req, res) => {
    res.json({ isSuperAdmin: isSuperAdmin((res.locals.session as Session).uid) });
  });

  // Everything below is super-admin only.
  router.use(requireSuperAdmin);

  // Cap the per-guild Discord fan-out so a bot in many guilds can't turn one
  // admin page load into hundreds of API calls (owner lookup is best-effort).
  const OWNER_LOOKUP_CAP = 100;

  router.get('/guilds', async (_req, res, next) => {
    try {
      const guilds = await listActiveGuilds();
      // "Who added the bot": audit-log attribution (invited_by) when known;
      // otherwise the guild OWNER, which is always readable and a reliable
      // proxy for old joins whose audit entry aged out or was never captured.
      let looked = 0;
      const enriched = await Promise.all(guilds.map(async (g) => {
        if (g.invited_by) return { ...g, attributed_to: g.invited_by, attribution: 'inviter' as const };
        if (looked >= OWNER_LOOKUP_CAP) return { ...g, attributed_to: null, attribution: 'unknown' as const };
        looked++;
        const owner = await rest.getGuildOwnerId(g.guild_id).catch(() => null);
        return owner
          ? { ...g, attributed_to: owner, attribution: 'owner' as const }
          : { ...g, attributed_to: null, attribution: 'unknown' as const };
      }));
      res.json(enriched);
    } catch (err) {
      next(err);
    }
  });

  // Everyone who ever logged into the dashboard, newest login first.
  // Accounts created before login tracking (or via linking alone) carry no
  // identity — resolve those from Discord once and persist the result.
  router.get('/users', async (_req, res, next) => {
    try {
      const users = await listUserAccounts();
      const missing = users.filter((u) => !u.uname).slice(0, 25);
      await Promise.all(missing.map(async (u) => {
        const fetched = await rest.getUser(u.user_id);
        if (fetched) {
          u.uname = fetched.username;
          u.avatar = fetched.avatar;
          await updateUserIdentity(u.user_id, fetched.username, fetched.avatar).catch(() => {});
        }
      }));
      res.json(users);
    } catch (err) {
      next(err);
    }
  });

  const BoolBody = z.object({ value: z.boolean() });

  // Per-USER premium grant (payments land later): raises the user's guild
  // link allowance from 1 to 3.
  // Blocking locks the user out of the whole dashboard API. The super-admin
  // cannot be blocked.
  router.post('/users/:userId/block', async (req, res, next) => {
    try {
      const parsed = BoolBody.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', 'value must be boolean');
        return;
      }
      if (isSuperAdmin(req.params.userId)) {
        apiError(res, 400, 'VALIDATION', 'cannot block the super admin');
        return;
      }
      await setUserBlocked(req.params.userId, parsed.data.value);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:userId/premium', async (req, res, next) => {
    try {
      const parsed = BoolBody.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', 'value must be boolean');
        return;
      }
      await setUserPremium(req.params.userId, parsed.data.value);
      res.json(await getUserPlan(req.params.userId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/guilds/:id/block', async (req, res, next) => {
    try {
      const parsed = BoolBody.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', 'value must be boolean');
        return;
      }
      await setGuildBlocked(req.params.id, parsed.data.value);
      // Blocking also removes the bot now; the bot refuses to rejoin while
      // blocked. leaveGuild throws on failure, so a Discord error surfaces to
      // the admin instead of a false {ok:true} — the block flag above is
      // already persisted either way.
      if (parsed.data.value) {
        await rest.leaveGuild(req.params.id);
        await recordGuildLeave(req.params.id);
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/guilds/:id/leave', async (req, res, next) => {
    try {
      await rest.leaveGuild(req.params.id);
      await recordGuildLeave(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });


  return router;
}
