import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { MemberSnapshotModel } from '../models.js';
import { recordMemberSnapshot, memberSnapshots } from './analytics-repo.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

function daysAgoKey(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

describe('analytics-repo: recordMemberSnapshot / memberSnapshots', () => {
  it('upserts one doc per guild+date, keeping the latest count', async () => {
    const today = daysAgoKey(0);
    await recordMemberSnapshot('gSnap', 10, today);
    await recordMemberSnapshot('gSnap', 15, today);
    const docs = await MemberSnapshotModel.find({ guild_id: 'gSnap', date: today }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].member_count).toBe(15);
  });

  it('returns snapshots within the window, ascending by date', async () => {
    await recordMemberSnapshot('gWin', 1, daysAgoKey(10));
    await recordMemberSnapshot('gWin', 2, daysAgoKey(5));
    await recordMemberSnapshot('gWin', 3, daysAgoKey(1));
    await recordMemberSnapshot('gWin', 99, daysAgoKey(50)); // outside 7d window
    const snaps = await memberSnapshots('gWin', 7);
    expect(snaps.map((s) => s.member_count)).toEqual([2, 3]);
    expect(snaps.map((s) => s.date)).toEqual([daysAgoKey(5), daysAgoKey(1)]);
  });

  it('isolates guilds', async () => {
    await recordMemberSnapshot('gIsoA', 5, daysAgoKey(0));
    await recordMemberSnapshot('gIsoB', 7, daysAgoKey(0));
    const a = await memberSnapshots('gIsoA', 7);
    expect(a).toHaveLength(1);
    expect(a[0].member_count).toBe(5);
  });
});
