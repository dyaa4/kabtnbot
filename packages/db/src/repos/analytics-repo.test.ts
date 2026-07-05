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
  mostActivePlayers,
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

  it('includes the boundary day today-days+1 and excludes today-days (the rendered window is inclusive)', async () => {
    const days = 7;

    // Completed exactly on today-days+1 -> the earliest day the caller renders. Must be included.
    const included = await createMatch({
      guildId: 'gMatchBoundary', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'chb1',
    });
    await setMatchStarted('gMatchBoundary', included._id.toString(), ['a'], ['b'], []);
    await completeMatch('gMatchBoundary', included._id.toString(), 'a');
    // The very START of the boundary day: the cutoff is floored to UTC midnight, so even
    // 00:00:00.000 on today-days+1 must be included (regression for time-of-day cutoffs).
    const includedDate = new Date();
    includedDate.setUTCDate(includedDate.getUTCDate() - (days - 1));
    includedDate.setUTCHours(0, 0, 0, 0);
    await MatchModel.updateOne({ _id: included._id }, { $set: { completed_at: includedDate } });

    // The very END of today-days -> one millisecond before the rendered window. Must be excluded.
    const excluded = await createMatch({
      guildId: 'gMatchBoundary', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'chb2',
    });
    await setMatchStarted('gMatchBoundary', excluded._id.toString(), ['a'], ['b'], []);
    await completeMatch('gMatchBoundary', excluded._id.toString(), 'a');
    const excludedDate = new Date();
    excludedDate.setUTCDate(excludedDate.getUTCDate() - days);
    excludedDate.setUTCHours(23, 59, 59, 999);
    await MatchModel.updateOne({ _id: excluded._id }, { $set: { completed_at: excludedDate } });

    const perDay = await matchesPerDay('gMatchBoundary', days);
    const total = perDay.reduce((sum, d) => sum + d.count, 0);
    expect(total).toBe(1);
    expect(perDay.some((d) => d.date === daysAgoKey(days - 1))).toBe(true);
    expect(perDay.some((d) => d.date === daysAgoKey(days))).toBe(false);
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

describe('analytics-repo: mostActivePlayers', () => {
  it('ranks players by matches played within the window, excluding matches outside it and other guilds', async () => {
    // u1 plays two completed matches "now" (team_a + team_b), u2 plays one.
    const m1 = await createMatch({
      guildId: 'gActive', creatorId: 'c', game: 'x', teamSize: 2, balanceMode: 'random', lobbyChannelId: 'ch1',
    });
    await setMatchStarted('gActive', m1._id.toString(), ['u1', 'u2'], ['u3'], []);
    await completeMatch('gActive', m1._id.toString(), 'a');

    const m2 = await createMatch({
      guildId: 'gActive', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch2',
    });
    await setMatchStarted('gActive', m2._id.toString(), ['u1'], ['u4'], []);
    await completeMatch('gActive', m2._id.toString(), 'a');

    // Completed 50 days ago -> outside a 30-day window; u1 should not get credit for it.
    const m3 = await createMatch({
      guildId: 'gActive', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch3',
    });
    await setMatchStarted('gActive', m3._id.toString(), ['u1'], ['u5'], []);
    await completeMatch('gActive', m3._id.toString(), 'a');
    const oldDate = new Date();
    oldDate.setUTCDate(oldDate.getUTCDate() - 50);
    await MatchModel.updateOne({ _id: m3._id }, { $set: { completed_at: oldDate } });

    // A different guild's matches must not leak in.
    const mOther = await createMatch({
      guildId: 'gActiveOther', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch4',
    });
    await setMatchStarted('gActiveOther', mOther._id.toString(), ['u1'], ['u6'], []);
    await completeMatch('gActiveOther', mOther._id.toString(), 'a');

    const ranked = await mostActivePlayers('gActive', 30, 5);
    expect(ranked[0]).toEqual({ user_id: 'u1', matches: 2 });
    const others = ranked.filter((r) => r.user_id !== 'u1').map((r) => r.user_id);
    expect(others.sort()).toEqual(['u2', 'u3', 'u4']);
    expect(ranked.every((r) => r.user_id !== 'u5' && r.user_id !== 'u6')).toBe(true);
  });

  it('respects the limit parameter', async () => {
    const m = await createMatch({
      guildId: 'gActiveLimit', creatorId: 'c', game: 'x', teamSize: 3, balanceMode: 'random', lobbyChannelId: 'ch',
    });
    await setMatchStarted('gActiveLimit', m._id.toString(), ['p1', 'p2', 'p3'], ['p4', 'p5', 'p6'], []);
    await completeMatch('gActiveLimit', m._id.toString(), 'a');

    const ranked = await mostActivePlayers('gActiveLimit', 30, 2);
    expect(ranked).toHaveLength(2);
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
