import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, getGuildConfig, recordBotHeartbeat, clearBotHeartbeat } from '@gamebot/db';
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

function setup() {
  clearAccessCache();
  const rest = new FakeDiscordRest();
  rest.userGuilds.set('at-1', [{ id: 'g1', name: 'ARAB', icon: null, permissions: MANAGE }]);
  rest.botGuilds.add('g1');
  const cookie = `${SESSION_COOKIE}=${signSession({ uid: 'u1', uname: 'x', avatar: null, eat: encryptToken('at-1') })}`;
  return { app: buildApp({ rest }), cookie, rest };
}

describe('api routes', () => {
  beforeEach(() => clearAccessCache());

  it('meta is public and contains invite url and guild count', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.inviteUrl).toContain('permissions=19926032');
    expect(typeof res.body.guilds).toBe('number');

    await recordBotHeartbeat(6);
    const after = await request(app).get('/api/meta');
    expect(after.body.guilds).toBe(6);
  });

  it('me requires session', async () => {
    const { app, cookie } = setup();
    expect((await request(app).get('/api/me')).status).toBe(401);
    const ok = await request(app).get('/api/me').set('Cookie', cookie);
    expect(ok.body).toEqual({ uid: 'u1', uname: 'x', avatar: null });
  });

  it('reports bot status (offline without heartbeat, online after one)', async () => {
    const { app, cookie } = setup();
    await clearBotHeartbeat(); // earlier tests may have recorded one
    expect((await request(app).get('/api/status')).status).toBe(401); // session required

    const before = await request(app).get('/api/status').set('Cookie', cookie);
    expect(before.status).toBe(200);
    expect(before.body.online).toBe(false);

    await recordBotHeartbeat(3);
    const after = await request(app).get('/api/status').set('Cookie', cookie);
    expect(after.body).toMatchObject({ online: true, guild_count: 3 });
  });

  it('lists eligible guilds', async () => {
    const { app, cookie } = setup();
    const res = await request(app).get('/api/guilds').set('Cookie', cookie);
    expect(res.body).toEqual([{ id: 'g1', name: 'ARAB', icon: null }]);
  });

  it('denies config access to non-managed guild', async () => {
    const { app, cookie } = setup();
    expect((await request(app).get('/api/guilds/gX/config').set('Cookie', cookie)).status).toBe(403);
  });

  it('reads and patches config; invalid patch → 400; premium not patchable', async () => {
    const { app, cookie } = setup();
    const before = await request(app).get('/api/guilds/g1/config').set('Cookie', cookie);
    expect(before.body.voice.wake_word).toBe('يا كابتن');

    const patch = await request(app)
      .patch('/api/guilds/g1/config')
      .set('Cookie', cookie)
      .send({ voice: { dialect: 'egyptian' } });
    expect(patch.status).toBe(200);
    expect(patch.body.voice.dialect).toBe('egyptian');
    expect((await getGuildConfig('g1')).voice.dialect).toBe('egyptian');

    const bad = await request(app)
      .patch('/api/guilds/g1/config')
      .set('Cookie', cookie)
      .send({ voice: { dialect: 'klingon' } });
    expect(bad.status).toBe(400);

    const premium = await request(app)
      .patch('/api/guilds/g1/config')
      .set('Cookie', cookie)
      .send({ premium: { active: true } });
    expect(premium.status).toBe(400);
  });

  it('patches protection.enabled and persists it', async () => {
    const { app, cookie } = setup();
    const patch = await request(app)
      .patch('/api/guilds/g1/config')
      .set('Cookie', cookie)
      .send({ protection: { enabled: true } });
    expect(patch.status).toBe(200);
    expect(patch.body.protection.enabled).toBe(true);
    expect((await getGuildConfig('g1')).protection.enabled).toBe(true);
  });

  it('rejects welcome.avatar_x out of range with 400', async () => {
    const { app, cookie } = setup();
    const res = await request(app)
      .patch('/api/guilds/g1/config')
      .set('Cookie', cookie)
      .send({ welcome: { avatar_x: 1.5 } });
    expect(res.status).toBe(400);
  });

  it('rejects unknown top-level customs key with 400', async () => {
    const { app, cookie } = setup();
    const res = await request(app)
      .patch('/api/guilds/g1/config')
      .set('Cookie', cookie)
      .send({ customs: { admin_role_id: 'r1' } });
    expect(res.status).toBe(400);
  });

  it('patches voice.personality_enabled and persists it', async () => {
    const { app, cookie } = setup();
    const patch = await request(app)
      .patch('/api/guilds/g1/config')
      .set('Cookie', cookie)
      .send({ voice: { personality_enabled: true } });
    expect(patch.status).toBe(200);
    expect(patch.body.voice.personality_enabled).toBe(true);
    expect((await getGuildConfig('g1')).voice.personality_enabled).toBe(true);
  });

  it('lists text channels by name; denies non-managed guild', async () => {
    const { app, cookie, rest } = setup();
    rest.textChannels.set('g1', [
      { id: '111', name: 'general' },
      { id: '222', name: 'logs' },
    ]);
    const res = await request(app).get('/api/guilds/g1/channels').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: '111', name: 'general' },
      { id: '222', name: 'logs' },
    ]);
    expect((await request(app).get('/api/guilds/gX/channels').set('Cookie', cookie)).status).toBe(403);
  });

  it('revoked Discord token → 401 UNAUTHENTICATED and clears the session cookie', async () => {
    clearAccessCache();
    const { app, cookie, rest } = setup();
    rest.revokedTokens.add('at-1');
    const res = await request(app).get('/api/guilds').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith('gb_session=;'))).toBe(true);
  });
});
