import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  listActiveGuilds, setGuildBlocked, recordGuildLeave, listPremiumGuildIds, setGuildPremium,
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

  router.get('/guilds', async (_req, res, next) => {
    try {
      const [guilds, premiumIds] = await Promise.all([listActiveGuilds(), listPremiumGuildIds()]);
      const premium = new Set(premiumIds);
      res.json(guilds.map((g) => ({ ...g, premium: premium.has(g.guild_id) })));
    } catch (err) {
      next(err);
    }
  });

  const BoolBody = z.object({ value: z.boolean() });

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

  router.post('/guilds/:id/premium', async (req, res, next) => {
    try {
      const parsed = BoolBody.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', 'value must be boolean');
        return;
      }
      await setGuildPremium(req.params.id, parsed.data.value);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
