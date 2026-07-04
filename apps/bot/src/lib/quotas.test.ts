import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, updateGuildConfig } from '@gamebot/db';
import { tryConsumeAiQuestion, addListenSeconds, isListenQuotaExceeded, todayKey } from './quotas.js';

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
});
