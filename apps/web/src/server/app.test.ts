import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from './app.js';
import { signSession, SESSION_COOKIE } from './session.js';
import { encryptToken } from './crypto.js';

describe('app', () => {
  it('serves /api/health', async () => {
    const res = await request(buildApp({} as never)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 401 for unknown api routes when unauthenticated (auth gate runs first)', async () => {
    const res = await request(buildApp({} as never)).get('/api/nope');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns JSON error shape for unknown api routes once authenticated', async () => {
    const cookie = `${SESSION_COOKIE}=${signSession({ uid: 'u1', uname: 'x', avatar: null, eat: encryptToken('at-1') })}`;
    const res = await request(buildApp({} as never)).get('/api/nope').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
