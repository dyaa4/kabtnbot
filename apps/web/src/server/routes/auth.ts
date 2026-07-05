import { Router } from 'express';
import { randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import type { DiscordRest } from '../discord-rest.js';
import { encryptToken } from '../crypto.js';
import { setSessionCookie, clearSessionCookie } from '../session.js';
import { apiError } from '../app.js';

const STATE_COOKIE = 'gb_state';

export function authRouter(rest: DiscordRest): Router {
  const router = Router();
  router.use(rateLimit({ windowMs: 5 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

  router.get('/discord', (_req, res) => {
    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', config.DISCORD_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${config.WEB_BASE_URL}/auth/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify guilds');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  });

  router.get('/callback', async (req, res, next) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const expected = (req.cookies as Record<string, string>)[STATE_COOKIE];
      if (!code || !state || !expected || state !== expected) {
        apiError(res, 403, 'BAD_STATE', 'OAuth state mismatch');
        return;
      }
      res.clearCookie(STATE_COOKIE);
      const { access_token } = await rest.exchangeCode(code);
      const me = await rest.getMe(access_token);
      setSessionCookie(res, {
        uid: me.id,
        uname: me.username,
        avatar: me.avatar,
        eat: encryptToken(access_token),
      });
      res.redirect('/app');
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  return router;
}
