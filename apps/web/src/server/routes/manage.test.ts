import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  connectDb, disconnectDb, createMatch, setMatchStarted, getActiveMatch, applyMatchResult,
} from '@gamebot/db';
import { buildApp } from '../app.js';
import { FakeDiscordRest } from '../testing/fake-rest.js';
import { signSession, SESSION_COOKIE } from '../session.js';
import { encryptToken } from '../crypto.js';
import { clearAccessCache } from '../guild-access.js';

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
  const rest = new FakeDiscordRest();
  rest.userGuilds.set('at-1', [{ id: guildId, name: 'G', icon: null, permissions: MANAGE }]);
  rest.botGuilds.add(guildId);
  const cookie = `${SESSION_COOKIE}=${signSession({ uid: 'u1', uname: 'x', avatar: null, eat: encryptToken('at-1') })}`;
  return { app: buildApp({ rest }), rest, cookie };
}

describe('stats & manage routes', () => {
  it('usage returns limits from effectiveQuotas', async () => {
    const { app, cookie } = setup('gU');
    const res = await request(app).get('/api/guilds/gU/usage').set('Cookie', cookie);
    expect(res.body.limits).toEqual({ listen_minutes_per_day: 60, ai_questions_per_day: 50 });
    expect(res.body.premium_active).toBe(false);
  });

  it('leaderboard lists players after results', async () => {
    const { app, cookie } = setup('gL');
    await applyMatchResult('gL', ['w'], ['l'], 25, -10);
    const res = await request(app).get('/api/guilds/gL/leaderboard').set('Cookie', cookie);
    expect(res.body[0].user_id).toBe('w');
  });

  it('cancel cancels active match and cleans up via rest', async () => {
    const { app, rest, cookie } = setup('gC');
    const m = await createMatch({ guildId: 'gC', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'lobby-ch' });
    await setMatchStarted('gC', m._id.toString(), ['a'], ['b'], ['vc1', 'vc2']);
    const res = await request(app).post(`/api/guilds/gC/matches/${m._id}/cancel`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(await getActiveMatch('gC')).toBeNull();
    expect(rest.deletedChannels).toEqual(['vc1', 'vc2']);
    // second cancel → 404
    expect((await request(app).post(`/api/guilds/gC/matches/${m._id}/cancel`).set('Cookie', cookie)).status).toBe(404);
  });

  it('adjust validates delta and applies it', async () => {
    const { app, cookie } = setup('gA');
    expect((await request(app).post('/api/guilds/gA/players/p1/adjust').set('Cookie', cookie).send({ delta: 0 })).status).toBe(400);
    expect((await request(app).post('/api/guilds/gA/players/p1/adjust').set('Cookie', cookie).send({ delta: 5000 })).status).toBe(400);
    const ok = await request(app).post('/api/guilds/gA/players/p1/adjust').set('Cookie', cookie).send({ delta: 100 });
    expect(ok.status).toBe(200);
    expect(ok.body.points).toBe(100);
  });
});
