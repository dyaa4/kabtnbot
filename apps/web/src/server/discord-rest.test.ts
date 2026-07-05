import { describe, it, expect, vi, afterEach } from 'vitest';
import { discordFetch } from './discord-rest.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discordFetch — 429 retry', () => {
  it('retries once after a 429 and returns the second response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await discordFetch('https://discord.com/api/v10/test', {});
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second 429 (no retry loop)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await discordFetch('https://discord.com/api/v10/test', {});
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-429 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await discordFetch('https://discord.com/api/v10/test', {});
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps the wait even for an absurd Retry-After header', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'Retry-After': '3600' } }))
        .mockResolvedValueOnce(new Response('ok', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const promise = discordFetch('https://discord.com/api/v10/test', {});
      await vi.advanceTimersByTimeAsync(5000); // capped at 5s, not 3600s
      const res = await promise;
      expect(res.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
