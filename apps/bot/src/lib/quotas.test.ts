import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, updateGuildConfig, setUserPremium, linkGuild } from '@gamebot/db';
import { tryConsumeAiQuestion, addListenSeconds, isListenQuotaExceeded, todayKey } from './quotas.js';
import { clearPremiumCache } from './premium-cache.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('quotas', () => {
  it('todayKey is UTC YYYY-MM-DD', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('AI questions stop at the configured limit', async () => {
    await updateGuildConfig('q1', { quotas: { ai_questions_per_day: 2 } });
    expect(await tryConsumeAiQuestion('q1')).toBe(true);
    expect(await tryConsumeAiQuestion('q1')).toBe(true);
    expect(await tryConsumeAiQuestion('q1')).toBe(false);
  });

  it('listen quota flips after limit', async () => {
    await updateGuildConfig('q2', { quotas: { listen_minutes_per_day: 1 } });
    expect(await isListenQuotaExceeded('q2')).toBe(false);
    await addListenSeconds('q2', 61);
    expect(await isListenQuotaExceeded('q2')).toBe(true);
  });

  it('a guild linked by a premium account gets the premium AI quota', async () => {
    await updateGuildConfig('q3', { quotas: { ai_questions_per_day: 1 } });
    await setUserPremium('owner-premium', true);
    await linkGuild('owner-premium', 'q3');
    clearPremiumCache();
    expect(await tryConsumeAiQuestion('q3')).toBe(true);
    // Beyond the configured 1/day — the premium floor (500) applies instead.
    expect(await tryConsumeAiQuestion('q3')).toBe(true);
  });
});
