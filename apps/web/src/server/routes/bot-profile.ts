import express, { type Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { BotMember, DiscordRest } from '../discord-rest.js';
import { DiscordApiError } from '../discord-rest.js';
import { hasPremiumAccess, requireGuildAccess } from '../guild-access.js';
import { isSuperAdmin } from '../config.js';
import type { Session } from '../session.js';
import { apiError } from '../app.js';
import { sniffImageType, imageDimensions, imageTooLarge } from '@gamebot/shared';

const NicknamePatch = z
  .object({
    nickname: z
      .string()
      .trim()
      .max(32)
      .transform((s) => (s === '' ? null : s))
      .nullable(),
  })
  .strict();

const CDN = 'https://cdn.discordapp.com';

function avatarUrlOf(guildId: string, member: BotMember): string | null {
  if (member.avatar) return `${CDN}/guilds/${guildId}/users/${member.user.id}/avatars/${member.avatar}.png?size=256`;
  if (member.user.avatar) return `${CDN}/avatars/${member.user.id}/${member.user.avatar}.png?size=256`;
  return null;
}

// Discord accepts data-URI avatars in PNG/JPEG/GIF; WebP uploads are rejected.
const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
const rawImage = express.raw({ type: () => true, limit: AVATAR_MAX_BYTES });

export function registerBotProfileRoutes(router: Router, rest: DiscordRest): void {
  const guard = requireGuildAccess(rest);
  // Discord rate-limits bot profile edits harshly (especially the global-avatar
  // fallback), so keep our own cap well below what a UI user would ever need.
  // Created per registration so each app instance gets its own counter store.
  const profileLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

  // Premium gate as MIDDLEWARE so it runs BEFORE the 8 MB avatar body is read —
  // a non-premium admin shouldn't be able to make the server buffer a full
  // upload only to reject it (Customize is premium, owner decision 2026-07-19).
  const requirePremium: express.RequestHandler = (req, res, next) => {
    hasPremiumAccess(req.params.guildId, res)
      .then((ok) => {
        if (ok) return next();
        apiError(res, 403, 'PREMIUM_REQUIRED', 'Bot customization requires premium');
      })
      .catch(next);
  };

  router.get('/guilds/:guildId/bot-profile', guard, async (req, res, next) => {
    try {
      const member = await rest.getBotMember(req.params.guildId);
      if (!member) {
        apiError(res, 404, 'NOT_FOUND', 'Bot is not a member of this guild');
        return;
      }
      res.json({
        nickname: member.nick ?? null,
        username: member.user.username,
        avatar_url: avatarUrlOf(req.params.guildId, member),
      });
    } catch (err) {
      next(err);
    }
  });

  // Customize tab is premium; GET stays open so the read-only card can still
  // display the current profile.
  router.patch('/guilds/:guildId/bot-profile', profileLimiter, guard, requirePremium, async (req, res, next) => {
    try {
      const parsed = NicknamePatch.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid nickname');
        return;
      }
      const member = await rest.editBotMember(req.params.guildId, { nick: parsed.data.nickname });
      res.json({ nickname: member.nick ?? null });
    } catch (err) {
      if (err instanceof DiscordApiError && err.status === 403) {
        apiError(res, 403, 'MISSING_PERMISSIONS', 'The bot lacks the Change Nickname permission');
        return;
      }
      next(err);
    }
  });

  router.put('/guilds/:guildId/bot-profile/avatar', profileLimiter, guard, requirePremium, rawImage, async (req, res, next) => {
    try {
      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        apiError(res, 400, 'VALIDATION', 'Missing image body');
        return;
      }
      const type = sniffImageType(body);
      if (!type || type === 'image/webp') {
        apiError(res, 400, 'UNSUPPORTED_TYPE', 'Only PNG, JPEG, or GIF images are allowed');
        return;
      }
      const dim = imageDimensions(body);
      if (!dim || imageTooLarge(dim)) {
        apiError(res, 400, 'IMAGE_TOO_LARGE', 'Image dimensions are too large (max 8000px per side)');
        return;
      }
      const dataUri = `data:${type};base64,${body.toString('base64')}`;

      // Try the per-guild bot avatar first. The GLOBAL fallback rebrands the
      // bot in EVERY guild, so it is reserved for the super-admin — a guild
      // admin must never be able to change how the bot looks for other guilds.
      const mayEditGlobal = isSuperAdmin((res.locals.session as Session).uid);
      let scope: 'guild' | 'global';
      try {
        const member = await rest.editBotMember(req.params.guildId, { avatar: dataUri });
        if (member.avatar) {
          scope = 'guild';
        } else if (mayEditGlobal) {
          await rest.editBotUser({ avatar: dataUri });
          scope = 'global';
        } else {
          apiError(res, 400, 'GUILD_AVATAR_UNSUPPORTED', 'Discord does not support a per-guild avatar for this bot');
          return;
        }
      } catch (err) {
        if (!(err instanceof DiscordApiError)) throw err;
        if (!mayEditGlobal) throw err;
        await rest.editBotUser({ avatar: dataUri });
        scope = 'global';
      }
      res.json({ ok: true, scope });
    } catch (err) {
      if (err instanceof DiscordApiError) {
        apiError(res, 400, 'DISCORD_REJECTED', 'Discord rejected the image (too large or rate limited)');
        return;
      }
      next(err);
    }
  });
}
