import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  connectDb, disconnectDb, createMatch, setMatchStarted, completeMatch,
  applyMatchResult, incrementAiQuestions, recordMemberSnapshot,
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

  it('happy path with member snapshots present: memberCount, joinedRecent order, totals, aggregates', async () => {
    const { app, rest, cookie } = setup('gStats1');
    const m1JoinedAt = isoDaysAgo(1);
    rest.membersList.set('gStats1', [
      { id: 'm1', username: 'Alice', avatar: null, joined_at: m1JoinedAt },
      { id: 'm2', username: 'Bob', avatar: null, joined_at: isoDaysAgo(5) },
      { id: 'm3', username: 'Carl', avatar: null, joined_at: isoDaysAgo(40) }, // outside 30d window
      { id: 'a', username: 'Player_A', avatar: null, joined_at: isoDaysAgo(50) }, // old join; just in members list for name mapping
    ]);
    rest.guildCounts.set('gStats1', 250);

    const m = await createMatch({
      guildId: 'gStats1', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch1',
    });
    await setMatchStarted('gStats1', m._id.toString(), ['a'], ['b'], []);
    await completeMatch('gStats1', m._id.toString(), 'a');

    await incrementAiQuestions('gStats1', todayKey());
    await incrementAiQuestions('gStats1', todayKey());

    await applyMatchResult('gStats1', ['a'], ['b'], 25, -10);

    await recordMemberSnapshot('gStats1', 200, todayKey());

    const res = await request(app).get('/api/guilds/gStats1/stats').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(250);
    expect(res.body.joinedRecent.map((j: { id: string }) => j.id)).toEqual(['m1', 'm2', 'm3', 'a']);
    expect(res.body.joinedRecent[0]).toEqual({ id: 'm1', username: 'Alice', avatar: null, joined_at: m1JoinedAt });
    expect(res.body.totals.newMembers).toBe(2); // m1, m2 within default 30d window; m3 outside
    expect(res.body.memberSeriesSource).toBe('snapshots');
    expect(res.body.memberSeries).toEqual([{ date: todayKey(), member_count: 200 }]);
    expect(res.body.totals.matches).toBe(1);
    expect(res.body.totals.aiQuestions).toBe(2);
    expect(res.body.topPlayers[0].user_id).toBe('a');
    expect(res.body.topPlayers[0].name).toBe('Player_A');
  });

  it('happy path without snapshots: joined_fallback cumulative series and memberCount fallback', async () => {
    const { app, rest, cookie } = setup('gStats2');
    rest.membersList.set('gStats2', [
      { id: 'm1', username: 'A', avatar: null, joined_at: isoDaysAgo(20) }, // within 30d window
      { id: 'm2', username: 'B', avatar: null, joined_at: isoDaysAgo(10) }, // within 30d window
      { id: 'm3', username: 'C', avatar: null, joined_at: isoDaysAgo(60) }, // outside window (baseline)
    ]);
    // no guildCounts set -> fallback to membersList length

    const res = await request(app).get('/api/guilds/gStats2/stats?days=30').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(3);
    expect(res.body.memberSeriesSource).toBe('joined_fallback');
    expect(res.body.memberSeries).toHaveLength(2);
    expect(res.body.memberSeries[0].member_count).toBe(2); // baseline 1 (m3) + m1
    expect(res.body.memberSeries[1].member_count).toBe(3); // + m2
    expect(res.body.totals.newMembers).toBe(2);
  });
});
