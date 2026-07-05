import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from './app.js';

describe('app', () => {
  it('serves /api/health', async () => {
    const res = await request(buildApp({} as never)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns JSON error shape for unknown api routes', async () => {
    const res = await request(buildApp({} as never)).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
