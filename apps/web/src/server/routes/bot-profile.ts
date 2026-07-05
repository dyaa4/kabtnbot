import express, { type Router } from 'express';
import { z } from 'zod';
import type { BotMember, DiscordRest } from '../discord-rest.js';
import { DiscordApiError } from '../discord-rest.js';
import { requireGuildAccess } from '../guild-access.js';
import { apiError } from '../app.js';
import { sniffImageType } from '../image-sniff.js';

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

  router.patch('/guilds/:guildId/bot-profile', guard, async (req, res, next) => {
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

  router.put('/guilds/:guildId/bot-profile/avatar', guard, rawImage, async (req, res, next) => {
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
      const dataUri = `data:${type};base64,${body.toString('base64')}`;

      // Try the per-guild bot avatar first; if Discord ignores the field (older
      // API behavior), fall back to the global bot avatar and tell the client.
      let scope: 'guild' | 'global';
      try {
        const member = await rest.editBotMember(req.params.guildId, { avatar: dataUri });
        if (member.avatar) {
          scope = 'guild';
        } else {
          await rest.editBotUser({ avatar: dataUri });
          scope = 'global';
        }
      } catch (err) {
        if (!(err instanceof DiscordApiError)) throw err;
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
