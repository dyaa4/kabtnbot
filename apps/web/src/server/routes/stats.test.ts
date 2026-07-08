import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  connectDb, disconnectDb, recordMemberSnapshot, recordMessage, recordReaction, addVoiceSeconds,
} from '@gamebot/db';
import { todayKey } from '@gamebot/shared';
import { buildApp } from '../app.js';
import { FakeDiscordRest } from '../testing/fake-rest.js';
import { signSession, SESSION_COOKIE } from '../session.js';
import { encryptToken } from '../crypto.js';
import { clearAccessCache } from '../guild-access.js';
import { clearStatsCache } from './api.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

const MANAGE = String(1 << 5);

function setup(guildId: string) {
  clearAccessCache();
  clearStatsCache();
  const rest = new FakeDiscordRest();
  rest.userGuilds.set('at-1', [{ id: guildId, name: 'G', icon: null, permissions: MANAGE }]);
  rest.botGuilds.add(guildId);
  const cookie = `${SESSION_COOKIE}=${signSession({ uid: 'u1', uname: 'x', avatar: null, eat: encryptToken('at-1') })}`;
  return { app: buildApp({ rest }), rest, cookie };
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function dateKeyDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

describe('stats route', () => {
  beforeEach(() => {
    clearAccessCache();
    clearStatsCache();
  });

  it('403 for a stranger without guild access', async () => {
    const { app, cookie } = setup('gStrangerReal');
    // Access a different guild the session has no access to.
    const res = await request(app).get('/api/guilds/gStrangerOther/stats').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('validates days query; invalid value -> 400', async () => {
    const { app, cookie } = setup('gDaysV');
    const res = await request(app).get('/api/guilds/gDaysV/stats?days=5').set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('defaults days to 30 when omitted', async () => {
    const { app, cookie } = setup('gDaysDefault');
    const res = await request(app).get('/api/guilds/gDaysDefault/stats').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('growth curve is cumulative by join date; memberCount, joinedRecent order, totals, topActive', async () => {
    const { app, rest, cookie } = setup('gStats1');
    const m1JoinedAt = isoDaysAgo(1);
    rest.membersList.set('gStats1', [
      { id: 'm1', username: 'Alice', avatar: null, joined_at: m1JoinedAt },
      { id: 'm2', username: 'Bob', avatar: null, joined_at: isoDaysAgo(5) },
      { id: 'm3', username: 'Carl', avatar: null, joined_at: isoDaysAgo(40) },
      { id: 'a', username: 'Player_A', avatar: null, joined_at: isoDaysAgo(50) },
    ]);
    rest.guildCounts.set('gStats1', 250);

    await recordMessage('gStats1', 'a', todayKey());
    await recordMessage('gStats1', 'a', todayKey());
    await recordReaction('gStats1', 'a', todayKey());
    await addVoiceSeconds('gStats1', 'a', todayKey(), 120); // 2 minutes
    await recordMessage('gStats1', 'm1', todayKey());

    // Snapshots exist but the growth curve is built from join dates and must ignore them.
    await recordMemberSnapshot('gStats1', 190, dateKeyDaysAgo(5));
    await recordMemberSnapshot('gStats1', 200, todayKey());

    const res = await request(app).get('/api/guilds/gStats1/stats').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(250);
    expect(res.body.joinedRecent.map((j: { id: string }) => j.id)).toEqual(['m1', 'm2', 'm3', 'a']);
    expect(res.body.joinedRecent[0]).toEqual({ id: 'm1', username: 'Alice', avatar: null, joined_at: m1JoinedAt });
    expect(res.body.totals.newMembers).toBe(2); // m1, m2 within default 30d window; m3 outside
    expect(res.body).not.toHaveProperty('memberSeriesSource');
    // Cumulative by join date (a→m3→m2→m1), then flat to today — snapshots (190/200) ignored.
    expect(res.body.memberSeries[0]).toEqual({ date: dateKeyDaysAgo(50), member_count: 1 });
    expect(res.body.memberSeries.map((p: { member_count: number }) => p.member_count)).toEqual([1, 2, 3, 4, 4]);
    expect(res.body.memberSeries.at(-1)).toEqual({ date: todayKey(), member_count: 4 });
    expect(res.body.totals.messages).toBe(3);
    expect(res.body.totals.voiceMinutes).toBe(2);
    expect(res.body.topActive[0].user_id).toBe('a');
    expect(res.body.topActive[0].name).toBe('Player_A');
    expect(res.body.topActive.map((r: { user_id: string }) => r.user_id)).toContain('m1');
  });

  it('a single member yields a two-point curve: join day and today', async () => {
    const { app, rest, cookie } = setup('gStatsOneSnap');
    rest.membersList.set('gStatsOneSnap', [
      { id: 'm1', username: 'A', avatar: null, joined_at: isoDaysAgo(1) },
    ]);

    const res = await request(app).get('/api/guilds/gStatsOneSnap/stats?days=7').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.memberSeries[0]).toEqual({ date: dateKeyDaysAgo(1), member_count: 1 });
    expect(res.body.memberSeries.at(-1)).toEqual({ date: todayKey(), member_count: 1 });
  });

  it('growth curve spans the full join history, independent of the day window', async () => {
    const { app, rest, cookie } = setup('gStats2');
    rest.membersList.set('gStats2', [
      { id: 'm1', username: 'A', avatar: null, joined_at: isoDaysAgo(20) },
      { id: 'm2', username: 'B', avatar: null, joined_at: isoDaysAgo(10) },
      { id: 'm3', username: 'C', avatar: null, joined_at: isoDaysAgo(60) }, // beyond the 30d window, still shown
    ]);
    // no guildCounts set -> fallback to membersList length

    const res = await request(app).get('/api/guilds/gStats2/stats?days=30').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(3);
    expect(res.body.memberSeries[0]).toEqual({ date: dateKeyDaysAgo(60), member_count: 1 }); // outside the 30d window
    expect(res.body.memberSeries.map((p: { member_count: number }) => p.member_count)).toEqual([1, 2, 3, 3]);
    expect(res.body.memberSeries.at(-1)).toEqual({ date: todayKey(), member_count: 3 });
    expect(res.body.totals.newMembers).toBe(2); // newMembers stays windowed: m1, m2 within 30d
  });

  it('daily series span the full selected window with zero-fill on empty days', async () => {
    const { app, cookie } = setup('gStatsFullWindow');
    const res = await request(app).get('/api/guilds/gStatsFullWindow/stats?days=7').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.messagesDaily).toHaveLength(7);
    expect(res.body.voiceMinutesDaily).toHaveLength(7);
    expect(res.body.messagesDaily.every((d: { count: number }) => d.count === 0)).toBe(true);
    expect(res.body.voiceMinutesDaily.every((d: { count: number }) => d.count === 0)).toBe(true);
    expect(res.body.messagesDaily.at(-1).date).toBe(todayKey());
    expect(res.body.topActive).toEqual([]);
  });

  it('activity seeded on the boundary day (today-days+1, i.e. fillDays[0]) appears with its true value and is included in totals', async () => {
    const { app, cookie } = setup('gStatsBoundaryUsage');
    const days = 7;
    const boundaryKey = dateKeyDaysAgo(days - 1); // earliest day the response renders

    await recordMessage('gStatsBoundaryUsage', 'u1', boundaryKey);
    await recordMessage('gStatsBoundaryUsage', 'u1', boundaryKey);

    const res = await request(app).get(`/api/guilds/gStatsBoundaryUsage/stats?days=${days}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.messagesDaily[0].date).toBe(boundaryKey);
    expect(res.body.messagesDaily[0].count).toBe(2);
    expect(res.body.totals.messages).toBe(2);
  });

  it('newMembers counts a join on the window boundary day (today-days+1)', async () => {
    const { app, rest, cookie } = setup('gStatsBoundaryJoin');
    const days = 7;
    const boundaryIso = isoDaysAgo(days - 1);
    const boundaryKey = boundaryIso.slice(0, 10);
    rest.membersList.set('gStatsBoundaryJoin', [
      { id: 'm1', username: 'A', avatar: null, joined_at: boundaryIso },
    ]);

    const res = await request(app).get(`/api/guilds/gStatsBoundaryJoin/stats?days=${days}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.memberSeries[0].date).toBe(boundaryKey);
    expect(res.body.memberSeries[0].member_count).toBe(1);
    expect(res.body.totals.newMembers).toBe(1);
  });

  it('a member who joined before the day window still appears in the full-history growth curve', async () => {
    const { app, rest, cookie } = setup('gStatsPreWindowJoin');
    const days = 7;
    const oldJoinIso = isoDaysAgo(days + 30); // well before the 7-day window
    rest.membersList.set('gStatsPreWindowJoin', [
      { id: 'm1', username: 'A', avatar: null, joined_at: oldJoinIso },
    ]);

    const res = await request(app).get(`/api/guilds/gStatsPreWindowJoin/stats?days=${days}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.memberSeries[0]).toEqual({ date: oldJoinIso.slice(0, 10), member_count: 1 });
    expect(res.body.memberSeries.at(-1).member_count).toBe(1);
    expect(res.body.totals.newMembers).toBe(0); // joined before the window
  });
});

describe('guild info route', () => {
  beforeEach(() => {
    clearAccessCache();
    clearStatsCache();
  });

  // Discord's documented example snowflake resolves to 2016 — proves the id-derived date.
  const SNOWFLAKE = '175928847299117063';

  it('returns server info plus a snowflake-derived creation date', async () => {
    const { app, rest, cookie } = setup(SNOWFLAKE);
    rest.guildInfo.set(SNOWFLAKE, {
      name: 'Kabtn HQ',
      icon: 'abc123',
      memberCount: 157,
      onlineCount: 42,
      boostTier: 2,
      boostCount: 9,
    });

    const res = await request(app).get(`/api/guilds/${SNOWFLAKE}/info`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Kabtn HQ',
      icon: 'abc123',
      memberCount: 157,
      onlineCount: 42,
      boostTier: 2,
      boostCount: 9,
    });
    expect(new Date(res.body.createdAt).getUTCFullYear()).toBe(2016);
  });

  it('404 when the bot cannot see the guild', async () => {
    const { app, cookie } = setup(SNOWFLAKE); // no guildInfo set -> getGuildInfo returns null
    const res = await request(app).get(`/api/guilds/${SNOWFLAKE}/info`).set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});
