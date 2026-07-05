import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { MemberSnapshotModel } from '../models.js';
import { incrementAiQuestions, incrementListenSeconds } from './usage-repo.js';
import { recordMemberSnapshot, memberSnapshots, aiUsageDaily } from './analytics-repo.js';

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

describe('analytics-repo: aiUsageDaily', () => {
  it('returns per-day usage within the window, ascending, guild-scoped', async () => {
    await incrementAiQuestions('gUse', daysAgoKey(2));
    await incrementAiQuestions('gUse', daysAgoKey(2));
    await incrementListenSeconds('gUse', 45, daysAgoKey(1));
    await incrementAiQuestions('gUse', daysAgoKey(60)); // outside 30-day window
    await incrementAiQuestions('gOtherUse', daysAgoKey(1)); // other guild

    const usage = await aiUsageDaily('gUse', 30);
    expect(usage).toHaveLength(2);
    expect(usage[0].date).toBe(daysAgoKey(2));
    expect(usage[0].ai_questions).toBe(2);
    expect(usage[1].date).toBe(daysAgoKey(1));
    expect(usage[1].listen_seconds).toBe(45);
  });

  it('includes the boundary day today-days+1 and excludes today-days (the rendered window is inclusive)', async () => {
    const days = 7;
    await incrementAiQuestions('gUseBoundary', daysAgoKey(days - 1)); // earliest rendered day -> included
    await incrementAiQuestions('gUseBoundary', daysAgoKey(days)); // one day before the window -> excluded

    const usage = await aiUsageDaily('gUseBoundary', days);
    const dates = usage.map((u) => u.date);
    expect(dates).toContain(daysAgoKey(days - 1));
    expect(dates).not.toContain(daysAgoKey(days));
  });
});
