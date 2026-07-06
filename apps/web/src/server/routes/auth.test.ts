import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { FakeDiscordRest } from '../testing/fake-rest.js';
import { SESSION_COOKIE, verifySession } from '../session.js';
import { decryptToken } from '../crypto.js';

// supertest types set-cookie as string, but Express always sends string[].
function setCookies(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function appWithFake() {
  const rest = new FakeDiscordRest();
  rest.users.set('at-123', { id: '42', username: 'dyaak', avatar: null });
  return { app: buildApp({ rest }), rest };
}

describe('auth routes', () => {
  it('GET /auth/discord redirects to Discord with state cookie', async () => {
    const { app } = appWithFake();
    const res = await request(app).get('/auth/discord');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('discord.com/oauth2/authorize');
    expect(res.headers.location).toContain('state=');
    expect(setCookies(res).join(';')).toContain('gb_state=');

    // redirect_uri must be well-formed — a double slash (from a trailing slash
    // on WEB_BASE_URL) makes Discord reject it as an invalid redirect.
    const redirect = new URL(res.headers.location).searchParams.get('redirect_uri');
    expect(redirect).toBe('http://localhost:3000/auth/callback');
    expect(redirect).not.toContain('//auth/callback');
  });

  it('callback rejects mismatched state', async () => {
    const { app } = appWithFake();
    const res = await request(app)
      .get('/auth/callback?code=c&state=WRONG')
      .set('Cookie', 'gb_state=RIGHT');
    expect(res.status).toBe(403);
  });

  it('callback exchanges code, sets session cookie with encrypted token, redirects to /app', async () => {
    const { app } = appWithFake();
    const res = await request(app)
      .get('/auth/callback?code=code-1&state=S')
      .set('Cookie', 'gb_state=S');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/app');
    const cookie = setCookies(res).find((c) => c.startsWith(SESSION_COOKIE + '='))!;
    const token = cookie.split(';')[0].split('=').slice(1).join('=');
    const session = verifySession(token)!;
    expect(session.uid).toBe('42');
    expect(decryptToken(session.eat)).toBe('at-123'); // FakeDiscordRest maps any code to 'at-123'
  });

  it('logout clears the cookie', async () => {
    const { app } = appWithFake();
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(204);
    expect(setCookies(res).join(';')).toContain(`${SESSION_COOKIE}=;`);
  });
});
