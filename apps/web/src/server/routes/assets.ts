import express, { type Router } from 'express';
import { putGuildAsset, getGuildAsset, deleteGuildAsset, MAX_ASSET_BYTES } from '@gamebot/db';
import type { DiscordRest } from '../discord-rest.js';
import { requireGuildAccess } from '../guild-access.js';
import { apiError } from '../app.js';
import { sniffImageType } from '../image-sniff.js';

// Buffer any content type: browsers send the file's own MIME type and we trust
// magic bytes, not the header. Size limit enforced here (413 mapped in app.ts).
const rawImage = express.raw({ type: () => true, limit: MAX_ASSET_BYTES });

export function registerAssetRoutes(router: Router, rest: DiscordRest): void {
  const guard = requireGuildAccess(rest);

  router.put('/guilds/:guildId/assets/welcome-banner', guard, rawImage, async (req, res, next) => {
    try {
      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        apiError(res, 400, 'VALIDATION', 'Missing image body');
        return;
      }
      const type = sniffImageType(body);
      if (!type) {
        apiError(res, 400, 'UNSUPPORTED_TYPE', 'Only PNG, JPEG, GIF, or WebP images are allowed');
        return;
      }
      await putGuildAsset(req.params.guildId, 'welcome_banner', type, body);
      res.json({ ok: true, content_type: type });
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/assets/welcome-banner', guard, async (req, res, next) => {
    try {
      const asset = await getGuildAsset(req.params.guildId, 'welcome_banner');
      if (!asset) {
        apiError(res, 404, 'NOT_FOUND', 'No banner uploaded');
        return;
      }
      res.setHeader('Content-Type', asset.content_type);
      res.setHeader('Cache-Control', 'private, no-cache');
      res.send(asset.data);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/guilds/:guildId/assets/welcome-banner', guard, async (req, res, next) => {
    try {
      await deleteGuildAsset(req.params.guildId, 'welcome_banner');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}
