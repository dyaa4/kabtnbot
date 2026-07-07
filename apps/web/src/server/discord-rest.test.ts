import { describe, it, expect, vi, afterEach } from 'vitest';
import { discordFetch, createDiscordRest } from './discord-rest.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function memberPage(ids: number[]) {
  return ids.map((n) => ({
    user: { id: String(n), username: `u${n}`, avatar: null },
    joined_at: '2024-01-01T00:00:00.000Z',
  }));
}

describe('listMembers — pagination past 1000', () => {
  it('follows ?after until a short page, so the newest members are included', async () => {
    const firstPage = memberPage(Array.from({ length: 1000 }, (_, i) => i + 1)); // ids 1..1000
    const secondPage = memberPage([1001, 1002, 1003]); // short page -> stop
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPage), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(secondPage), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const members = await createDiscordRest().listMembers('g1');

    expect(members).toHaveLength(1003);
    expect(members.at(-1)?.id).toBe('1003'); // newest member present
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second request pages from the last id of the first page.
    expect(String(fetchMock.mock.calls[1][0])).toContain('after=1000');
  });

  it('stops after a single short page (guild <1000 members)', async () => {
    const only = memberPage([1, 2, 3]);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(only), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const members = await createDiscordRest().listMembers('g2');

    expect(members).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
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
