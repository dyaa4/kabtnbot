import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { apiError } from './app.js';

export const SESSION_COOKIE = 'gb_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface Session {
  uid: string;
  uname: string;
  avatar: string | null;
  eat: string; // encrypted user access token
}

export function signSession(s: Session): string {
  return jwt.sign(s, config.SESSION_SECRET, { expiresIn: '7d' });
}

export function verifySession(token: string): Session | null {
  try {
    const p = jwt.verify(token, config.SESSION_SECRET) as jwt.JwtPayload & Session;
    // A validly-signed token with a missing/foreign-shaped payload (e.g. from an
    // older session format) must read as "not logged in", not crash downstream
    // when the encrypted access token gets decrypted.
    if (typeof p.uid !== 'string' || typeof p.uname !== 'string' || typeof p.eat !== 'string') return null;
    return { uid: p.uid, uname: p.uname, avatar: p.avatar ?? null, eat: p.eat };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, s: Session): void {
  res.cookie(SESSION_COOKIE, signSession(s), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    secure: config.WEB_BASE_URL.startsWith('https'),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE);
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const token = (req.cookies as Record<string, string>)[SESSION_COOKIE];
  const session = token ? verifySession(token) : null;
  if (!session) {
    apiError(res, 401, 'UNAUTHENTICATED', 'Login required');
    return;
  }
  res.locals.session = session;
  next();
}
