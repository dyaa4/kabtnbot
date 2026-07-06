import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, recordBotHeartbeat, clearBotHeartbeat } from '@gamebot/db';
import { evaluateTransition, createStatusAlerter } from './status-alert.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('evaluateTransition', () => {
  it('never alerts on the first observation and only on changes', () => {
    expect(evaluateTransition(null, true)).toBeNull();
    expect(evaluateTransition(null, false)).toBeNull();
    expect(evaluateTransition(true, true)).toBeNull();
    expect(evaluateTransition(true, false)).toBe('went_offline');
    expect(evaluateTransition(false, true)).toBe('came_online');
  });
});

describe('createStatusAlerter', () => {
  it('posts offline and recovery alerts to the webhook on transitions only', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 204 })) as unknown as typeof fetch;
    const alerter = createStatusAlerter('https://discord.com/api/webhooks/x/y', fetchFn);

    await recordBotHeartbeat(2);
    expect(await alerter.tick()).toBeNull(); // first observation: online, silent
    expect(await alerter.tick()).toBeNull(); // unchanged: silent

    await clearBotHeartbeat();
    expect(await alerter.tick()).toBe('went_offline');
    let body = JSON.parse(((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string);
    expect(body.content).toContain('🔴');

    await recordBotHeartbeat(2);
    expect(await alerter.tick()).toBe('came_online');
    body = JSON.parse(((fetchFn as ReturnType<typeof vi.fn>).mock.calls[1][1] as RequestInit).body as string);
    expect(body.content).toContain('🟢');

    expect(fetchFn).toHaveBeenCalledTimes(2); // exactly one alert per transition
  });

  it('survives webhook failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('webhook gone');
    }) as unknown as typeof fetch;
    const alerter = createStatusAlerter('https://discord.com/api/webhooks/x/y', failing);

    await clearBotHeartbeat();
    await alerter.tick(); // offline, first observation → silent, no fetch
    await recordBotHeartbeat(1);
    await expect(alerter.tick()).resolves.toBe('came_online'); // fetch fails but tick doesn't throw
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
