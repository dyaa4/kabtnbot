import { Router } from 'express';
import { z } from 'zod';
import { getGuildConfig, updateGuildConfig } from '@gamebot/db';
import { DIALECTS } from '@gamebot/shared';
import { config } from '../config.js';
import type { DiscordRest } from '../discord-rest.js';
import type { Session } from '../session.js';
import { requireSession } from '../session.js';
import { listEligibleGuilds, requireGuildAccess } from '../guild-access.js';
import { apiError } from '../app.js';

const ConfigPatch = z
  .object({
    voice: z
      .object({
        enabled: z.boolean().optional(),
        wake_word: z.string().min(2).max(30).optional(),
        dialect: z.enum(DIALECTS).optional(),
        allowed_channel_ids: z.array(z.string()).max(50).optional(),
      })
      .strict()
      .optional(),
    customs: z
      .object({
        win_points: z.number().int().min(-1000).max(1000).optional(),
        loss_points: z.number().int().min(-1000).max(1000).optional(),
        admin_role_id: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export function apiRouter(rest: DiscordRest): Router {
  const router = Router();

  router.get('/meta', (_req, res) => {
    res.json({
      clientId: config.DISCORD_CLIENT_ID,
      inviteUrl: `https://discord.com/oauth2/authorize?client_id=${config.DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=19926032`,
    });
  });

  router.use(requireSession);

  router.get('/me', (_req, res) => {
    const s = res.locals.session as Session;
    res.json({ uid: s.uid, uname: s.uname, avatar: s.avatar });
  });

  router.get('/guilds', async (_req, res, next) => {
    try {
      res.json(await listEligibleGuilds(rest, res.locals.session as Session));
    } catch (err) {
      next(err);
    }
  });

  const guard = requireGuildAccess(rest);

  router.get('/guilds/:guildId/config', guard, async (req, res, next) => {
    try {
      res.json(await getGuildConfig(req.params.guildId));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/guilds/:guildId/config', guard, async (req, res, next) => {
    try {
      const parsed = ConfigPatch.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid patch');
        return;
      }
      res.json(await updateGuildConfig(req.params.guildId, parsed.data));
    } catch (err) {
      next(err);
    }
  });

  registerStatsRoutes(router, rest); // grown in Task 8

  return router;
}

// Task 8 fills this in.
function registerStatsRoutes(_router: Router, _rest: DiscordRest): void {}
