import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { recordMessage, recordReaction, addVoiceSeconds, topActive, activityDaily } from './activity-repo.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

const today = new Date().toISOString().slice(0, 10);

describe('activity-repo', () => {
  it('accumulates and ranks by composite score, guild-scoped', async () => {
    await recordMessage('gA', 'u1', today);
    await recordMessage('gA', 'u1', today);
    await addVoiceSeconds('gA', 'u1', today, 600); // 10 min → 20
    await recordReaction('gA', 'u2', today);
    await addVoiceSeconds('gA', 'u2', today, 60); // 1 min → 2
    // u1 score = 2 msgs + 20 + 0 = 22 ; u2 = 0 + 2 + 1 = 3
    const top = await topActive('gA', 7, 5);
    expect(top[0].user_id).toBe('u1');
    expect(top[0].score).toBe(22);
    expect(top[1].user_id).toBe('u2');
    // isolation
    expect(await topActive('gB', 7, 5)).toEqual([]);
  });

  it('activityDaily returns a summed row for the day', async () => {
    const rows = await activityDaily('gA', 7);
    const todays = rows.find((r) => r.date === today)!;
    expect(todays.messages).toBe(2);
    expect(todays.voice_seconds).toBe(660);
    expect(todays.reactions).toBe(1);
  });
});
