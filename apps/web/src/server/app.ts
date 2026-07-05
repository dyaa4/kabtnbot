import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DiscordRest } from './discord-rest.js';
import { DiscordAuthError } from './discord-rest.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { clearSessionCookie } from './session.js';

export interface AppDeps {
  rest: DiscordRest;
}

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/client');

export function apiError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export function buildApp(deps: AppDeps): Express {
  const app = express();
  // Trust the first hop (TLS-terminating reverse proxy) so the rate limiter sees the real
  // client IP and secure cookies are set correctly behind HTTPS termination.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  registerRoutes(app, deps); // grown in Tasks 5–8

  app.use('/api', (_req, res) => apiError(res, 404, 'NOT_FOUND', 'Unknown API route'));

  app.use(express.static(CLIENT_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIR, 'index.html'), (err) => {
      if (err) res.status(404).end();
    });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DiscordAuthError) {
      clearSessionCookie(res);
      apiError(res, 401, 'UNAUTHENTICATED', 'Discord authorization expired');
      return;
    }
    if ((err as { type?: string }).type === 'entity.too.large') {
      apiError(res, 413, 'TOO_LARGE', 'File exceeds the size limit');
      return;
    }
    console.error('[Web] Unhandled:', err);
    apiError(res, 500, 'INTERNAL', 'Internal server error');
  });

  return app;
}

// Route registration point; Tasks 5–8 append registrations here.
function registerRoutes(app: Express, deps: AppDeps): void {
  app.use('/auth', authRouter(deps.rest));
  app.use('/api', apiRouter(deps.rest));
}
