import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { addXp, getMemberLevel, topMembers, getMemberRank } from './leveling-repo.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('leveling-repo', () => {
  it('accumulates XP and reports level-up on boundary crossing', async () => {
    const first = await addXp('g1', 'u1', 60);
    expect(first.xp).toBe(60);
    expect(first.level).toBe(0);
    expect(first.leveledUp).toBe(false);

    const second = await addXp('g1', 'u1', 60); // 120 total → level 1
    expect(second.xp).toBe(120);
    expect(second.level).toBe(1);
    expect(second.leveledUp).toBe(true);

    const stored = await getMemberLevel('g1', 'u1');
    expect(stored).toEqual({ xp: 120, level: 1 });
  });

  it('ranks members by XP within a guild and isolates guilds', async () => {
    await addXp('g1', 'u2', 500);
    await addXp('g1', 'u3', 10);
    await addXp('g2', 'uX', 9999); // other guild — must not affect g1

    const top = await topMembers('g1', 10);
    expect(top.map((m) => m.user_id)).toEqual(['u2', 'u1', 'u3']);

    expect(await getMemberRank('g1', 'u2')).toBe(1);
    expect(await getMemberRank('g1', 'u1')).toBe(2);
    expect(await getMemberRank('g1', 'u3')).toBe(3);
    expect(await getMemberRank('g1', 'unknown')).toBeNull();
  });
});
