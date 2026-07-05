import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, getGuildAsset } from '@gamebot/db';
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
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function setup() {
  clearAccessCache();
  const rest = new FakeDiscordRest();
  rest.userGuilds.set('at-1', [{ id: 'g1', name: 'ARAB', icon: null, permissions: MANAGE }]);
  rest.botGuilds.add('g1');
  const cookie = `${SESSION_COOKIE}=${signSession({ uid: 'u1', uname: 'x', avatar: null, eat: encryptToken('at-1') })}`;
  return { app: buildApp({ rest }), cookie, rest };
}

describe('welcome-banner asset routes', () => {
  beforeEach(() => clearAccessCache());

  it('uploads, serves, and deletes a banner', async () => {
    const { app, cookie } = setup();

    const put = await request(app)
      .put('/api/guilds/g1/assets/welcome-banner')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true, content_type: 'image/png' });
    expect((await getGuildAsset('g1', 'welcome_banner'))?.content_type).toBe('image/png');

    const get = await request(app).get('/api/guilds/g1/assets/welcome-banner').set('Cookie', cookie);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(get.body as Buffer, PNG)).toBe(0);

    const del = await request(app).delete('/api/guilds/g1/assets/welcome-banner').set('Cookie', cookie);
    expect(del.status).toBe(200);
    expect(await getGuildAsset('g1', 'welcome_banner')).toBeNull();
    expect((await request(app).get('/api/guilds/g1/assets/welcome-banner').set('Cookie', cookie)).status).toBe(404);
  });

  it('rejects non-image bytes regardless of Content-Type header', async () => {
    const { app, cookie } = setup();
    const res = await request(app)
      .put('/api/guilds/g1/assets/welcome-banner')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('not an image'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects empty body and denies non-managed guilds', async () => {
    const { app, cookie } = setup();
    const empty = await request(app)
      .put('/api/guilds/g1/assets/welcome-banner')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/png');
    expect(empty.status).toBe(400);
    expect(
      (await request(app).put('/api/guilds/gX/assets/welcome-banner').set('Cookie', cookie).send(PNG)).status,
    ).toBe(403);
  });
});

describe('bot-profile routes', () => {
  beforeEach(() => clearAccessCache());

  it('reads the bot profile with defaults', async () => {
    const { app, cookie } = setup();
    const res = await request(app).get('/api/guilds/g1/bot-profile').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nickname: null, username: 'kabtn', avatar_url: null });
  });

  it('sets and clears the nickname', async () => {
    const { app, cookie, rest } = setup();
    const set = await request(app)
      .patch('/api/guilds/g1/bot-profile')
      .set('Cookie', cookie)
      .send({ nickname: 'كابتن بوت' });
    expect(set.status).toBe(200);
    expect(set.body.nickname).toBe('كابتن بوت');
    expect(rest.botProfiles.get('g1')?.nick).toBe('كابتن بوت');

    const clear = await request(app)
      .patch('/api/guilds/g1/bot-profile')
      .set('Cookie', cookie)
      .send({ nickname: '' });
    expect(clear.status).toBe(200);
    expect(clear.body.nickname).toBeNull();
  });

  it('maps Discord 403 to MISSING_PERMISSIONS and rejects >32 chars', async () => {
    const { app, cookie, rest } = setup();
    rest.forbidNickname = true;
    const res = await request(app)
      .patch('/api/guilds/g1/bot-profile')
      .set('Cookie', cookie)
      .send({ nickname: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MISSING_PERMISSIONS');

    const long = await request(app)
      .patch('/api/guilds/g1/bot-profile')
      .set('Cookie', cookie)
      .send({ nickname: 'a'.repeat(33) });
    expect(long.status).toBe(400);
  });

  it('uploads a per-guild avatar when supported', async () => {
    const { app, cookie, rest } = setup();
    const res = await request(app)
      .put('/api/guilds/g1/bot-profile/avatar')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, scope: 'guild' });
    expect(rest.botProfiles.get('g1')?.avatar).toBe('hash-guild');
    expect(rest.globalAvatar).toBeNull();
  });

  it('falls back to the global avatar when the guild avatar is not applied', async () => {
    const { app, cookie, rest } = setup();
    rest.supportsGuildAvatar = false;
    const res = await request(app)
      .put('/api/guilds/g1/bot-profile/avatar')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('global');
    expect(rest.globalAvatar).toContain('data:image/png;base64,');
  });

  it('rejects webp avatars (Discord unsupported)', async () => {
    const { app, cookie } = setup();
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([16, 0, 0, 0]),
      Buffer.from('WEBPVP8 '),
    ]);
    const res = await request(app)
      .put('/api/guilds/g1/bot-profile/avatar')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/webp')
      .send(webp);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_TYPE');
  });
});
