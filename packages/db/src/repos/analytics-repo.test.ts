import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { MatchModel, PlayerModel, MemberSnapshotModel } from '../models.js';
import { createMatch, setMatchStarted, completeMatch } from './match-repo.js';
import { incrementAiQuestions, incrementListenSeconds } from './usage-repo.js';
import {
  recordMemberSnapshot,
  memberSnapshots,
  matchesPerDay,
  aiUsageDaily,
  newPlayersPerDay,
} from './analytics-repo.js';

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

describe('analytics-repo: matchesPerDay', () => {
  it('counts only completed matches within the window, grouped by day', async () => {
    // Completed "now" -> within a 30-day window.
    const m1 = await createMatch({
      guildId: 'gMatch', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch1',
    });
    await setMatchStarted('gMatch', m1._id.toString(), ['a'], ['b'], []);
    await completeMatch('gMatch', m1._id.toString(), 'a');

    // Completed 50 days ago -> outside a 30-day window.
    const m2 = await createMatch({
      guildId: 'gMatch', creatorId: 'c', game: 'y', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch2',
    });
    await setMatchStarted('gMatch', m2._id.toString(), ['a'], ['b'], []);
    await completeMatch('gMatch', m2._id.toString(), 'a');
    const oldDate = new Date();
    oldDate.setUTCDate(oldDate.getUTCDate() - 50);
    await MatchModel.updateOne({ _id: m2._id }, { $set: { completed_at: oldDate } });

    // Cancelled, never counted regardless of date.
    const m3 = await createMatch({
      guildId: 'gMatch', creatorId: 'c', game: 'z', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch3',
    });
    await MatchModel.updateOne({ _id: m3._id }, { $set: { status: 'cancelled', completed_at: new Date() } });

    const perDay = await matchesPerDay('gMatch', 30);
    const total = perDay.reduce((sum, d) => sum + d.count, 0);
    expect(total).toBe(1);
    expect(perDay.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
  });

  it('isolates guilds', async () => {
    const m = await createMatch({
      guildId: 'gMatchIso', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch',
    });
    await setMatchStarted('gMatchIso', m._id.toString(), ['a'], ['b'], []);
    await completeMatch('gMatchIso', m._id.toString(), 'a');
    expect(await matchesPerDay('gOtherMatch', 30)).toEqual([]);
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
});

describe('analytics-repo: newPlayersPerDay', () => {
  it('groups player creation by day, guild-scoped, within the window', async () => {
    await PlayerModel.create({ guild_id: 'gNew', user_id: 'u1' });
    await PlayerModel.create({ guild_id: 'gNew', user_id: 'u2' });
    const oldPlayer = await PlayerModel.create({ guild_id: 'gNew', user_id: 'u3' });
    const oldDate = new Date();
    oldDate.setUTCDate(oldDate.getUTCDate() - 100);
    // Bypass Mongoose's query layer (which strips createdAt from $set) via the native driver.
    await PlayerModel.collection.updateOne({ _id: oldPlayer._id }, { $set: { created_at: oldDate } });
    await PlayerModel.create({ guild_id: 'gOtherNew', user_id: 'u4' });

    const perDay = await newPlayersPerDay('gNew', 30);
    const total = perDay.reduce((sum, d) => sum + d.count, 0);
    expect(total).toBe(2);
    expect(perDay.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
  });
});
