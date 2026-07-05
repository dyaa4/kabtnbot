import { describe, it, expect } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { encryptToken, decryptToken } from './crypto.js';
import { signSession, verifySession, requireSession, setSessionCookie, SESSION_COOKIE } from './session.js';

describe('crypto', () => {
  it('roundtrips and produces distinct ciphertexts', () => {
    const a = encryptToken('secret-token');
    const b = encryptToken('secret-token');
    expect(a).not.toBe(b); // random IV
    expect(decryptToken(a)).toBe('secret-token');
  });
  it('rejects tampered blobs', () => {
    const blob = encryptToken('x');
    expect(() => decryptToken(blob.slice(0, -2) + 'ab')).toThrow();
  });
});

describe('session', () => {
  const sess = { uid: '1', uname: 'user', avatar: null, eat: encryptToken('at') };

  it('signs and verifies', () => {
    expect(verifySession(signSession(sess))).toMatchObject({ uid: '1', uname: 'user' });
  });
  it('rejects garbage', () => {
    expect(verifySession('garbage')).toBeNull();
  });

  it('requireSession: 401 without cookie, passes with cookie', async () => {
    const app = express();
    app.use(cookieParser());
    app.get('/x', requireSession, (_req, res) => {
      res.json({ uid: res.locals.session.uid });
    });
    expect((await request(app).get('/x')).status).toBe(401);
    const ok = await request(app).get('/x').set('Cookie', `${SESSION_COOKIE}=${signSession(sess)}`);
    expect(ok.status).toBe(200);
    expect(ok.body.uid).toBe('1');
  });
});
