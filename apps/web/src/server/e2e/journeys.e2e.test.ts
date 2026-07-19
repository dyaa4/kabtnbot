import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  getGuildConfig, updateGuildConfig, getGuildAsset, linkGuild, unlinkGuild,
  startVoiceSession, incrementListenSeconds, incrementAiQuestions, recordBotHeartbeat, clearBotHeartbeat,
} from '@gamebot/db';
import { monthKey, todayKey } from '@gamebot/shared';
import { startDb, stopDb, scenario, login } from '../testing/e2e.js';
import { clearAccessCache } from '../guild-access.js';
import { pngHeader } from '../testing/image-fixtures.js';

// Full backend journeys: real Express stack + real in-memory MongoDB + faked
// Discord, driven through the genuine OAuth login. Each test walks a complete
// user flow across multiple endpoints and asserts persistence.

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearAccessCache);

const MANAGE = String(1 << 5);

describe('journey: auth + identity', () => {
  it('logs in via OAuth, sees identity + manageable guilds, then logout revokes access', async () => {
    const { app } = scenario();
    const agent = await login(app);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ uid: 'u1', uname: 'dyaak' });

    const guilds = await agent.get('/api/guilds');
    expect(guilds.status).toBe(200);
    expect(guilds.body).toEqual([{ id: 'g1', name: 'ARAB GAMERS', icon: null }]);

    const logout = await agent.post('/auth/logout');
    expect(logout.status).toBe(204);

    // Cookie cleared → the very same agent is now unauthenticated.
    const after = await agent.get('/api/me');
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('journey: authorization wall', () => {
  it('blocks every guild-scoped route without a session but keeps /api/meta public', async () => {
    const { app } = scenario();

    expect((await request(app).get('/api/meta')).status).toBe(200); // public
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/guilds/g1/config')).status).toBe(401);
    expect(
      (await request(app).patch('/api/guilds/g1/config').send({ welcome: { enabled: true } })).status,
    ).toBe(401);
  });

  it('returns 403 for a guild the logged-in user cannot manage', async () => {
    // User manages g1 (Manage Guild) but only *sees* g2 without permission.
    const { app } = scenario({
      guilds: [
        { id: 'g1', name: 'Mine', permissions: MANAGE, botPresent: true },
        { id: 'g2', name: 'Not mine', permissions: '0', botPresent: true },
      ],
    });
    const agent = await login(app);

    expect((await agent.get('/api/guilds/g1/config')).status).toBe(200);
    const forbidden = await agent.get('/api/guilds/g2/config');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    // g2 is filtered out of the manageable list entirely.
    expect((await agent.get('/api/guilds')).body).toEqual([{ id: 'g1', name: 'Mine', icon: null }]);
  });
});

describe('journey: config read → patch → persistence', () => {
  it('patches multiple sections in one request and reads them back, DB included', async () => {
    const { app } = scenario();
    const agent = await login(app);

    const before = await agent.get('/api/guilds/g1/config');
    expect(before.status).toBe(200);
    expect(before.body.language).toBe('ar'); // default

    const patch = await agent.patch('/api/guilds/g1/config').send({
      language: 'de',
      welcome: { enabled: true, message: 'Willkommen {user}!' },
      protection: { enabled: true, text_protection: true },
    });
    expect(patch.status).toBe(200);

    // Read back over HTTP…
    const after = await agent.get('/api/guilds/g1/config');
    expect(after.body.language).toBe('de');
    expect(after.body.welcome.message).toBe('Willkommen {user}!');
    expect(after.body.welcome.enabled).toBe(true);
    expect(after.body.protection.text_protection).toBe(true);

    // …and confirm it actually persisted in Mongo, not just echoed.
    const stored = await getGuildConfig('g1');
    expect(stored.language).toBe('de');
    expect(stored.welcome.message).toBe('Willkommen {user}!');
  });

  it('rejects an invalid patch and leaves the stored config untouched', async () => {
    const { app } = scenario();
    const agent = await login(app);
    await agent.patch('/api/guilds/g1/config').send({ language: 'en' });

    const bad = await agent.patch('/api/guilds/g1/config').send({
      language: 'xx', // not a supported language
      welcome: { avatar_x: 9 }, // out of 0..1 range
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION');

    expect((await getGuildConfig('g1')).language).toBe('en'); // unchanged
  });

  it('rejects an unknown role for the guild (role must exist)', async () => {
    const { app, rest } = scenario();
    rest.roles.set('g1', [{ id: 'r1', name: 'Mods' }]);
    const agent = await login(app);

    expect((await agent.patch('/api/guilds/g1/config').send({ admin_role_id: 'r1' })).status).toBe(200);
    const bad = await agent.patch('/api/guilds/g1/config').send({ admin_role_id: 'r-ghost' });
    expect(bad.status).toBe(400);
  });
});

describe('journey: welcome banner asset lifecycle', () => {
  it('uploads, serves the exact bytes, then deletes a banner', async () => {
    const { app } = scenario();
    const agent = await login(app);
    const png = pngHeader(400, 200);

    expect((await agent.get('/api/guilds/g1/assets/welcome-banner')).status).toBe(404); // none yet

    const put = await agent
      .put('/api/guilds/g1/assets/welcome-banner')
      .set('Content-Type', 'image/png')
      .send(png);
    expect(put.status).toBe(200);
    expect(await getGuildAsset('g1', 'welcome_banner')).toBeTruthy();

    const get = await agent.get('/api/guilds/g1/assets/welcome-banner');
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(get.body as Buffer, png)).toBe(0);

    expect((await agent.delete('/api/guilds/g1/assets/welcome-banner')).status).toBe(200);
    expect((await agent.get('/api/guilds/g1/assets/welcome-banner')).status).toBe(404);
  });

  it('rejects a non-image upload', async () => {
    const { app } = scenario();
    const agent = await login(app);
    const bad = await agent
      .put('/api/guilds/g1/assets/welcome-banner')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('this is not a png'));
    expect(bad.status).toBe(400);
  });
});

describe('journey: bot profile', () => {
  it('sets and clears the bot nickname and reflects it on read', async () => {
    const { app } = scenario();
    const agent = await login(app);
    await linkGuild('u1', 'g1'); // customization is premium-gated

    const set = await agent.patch('/api/guilds/g1/bot-profile').send({ nickname: 'كابتن' });
    expect(set.status).toBe(200);
    expect((await agent.get('/api/guilds/g1/bot-profile')).body.nickname).toBe('كابتن');

    const clear = await agent.patch('/api/guilds/g1/bot-profile').send({ nickname: '' });
    expect(clear.status).toBe(200);
    expect((await agent.get('/api/guilds/g1/bot-profile')).body.nickname).toBeNull();
    await unlinkGuild('u1', 'g1');
  });

  it('maps a missing Change-Nickname permission to a clean error', async () => {
    const { app, rest } = scenario();
    rest.forbidNickname = true;
    const agent = await login(app);
    await linkGuild('u1', 'g1');
    const res = await agent.patch('/api/guilds/g1/bot-profile').send({ nickname: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MISSING_PERMISSIONS');
    await unlinkGuild('u1', 'g1');
  });

  it('denies customization on a guild nobody linked (premium gate)', async () => {
    const { app } = scenario();
    const agent = await login(app);
    const res = await agent.patch('/api/guilds/g1/bot-profile').send({ nickname: 'كابتن' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PREMIUM_REQUIRED');
  });
});

describe('journey: read-only dashboards (stats, usage, voice-log, status)', () => {
  it('surfaces seeded usage and MONTHLY quota limits', async () => {
    const { app } = scenario();
    const agent = await login(app);
    // Quota accounting is per calendar month.
    await incrementListenSeconds('g1', 120, monthKey());
    await incrementAiQuestions('g1', monthKey());

    const usage = await agent.get('/api/guilds/g1/usage');
    expect(usage.status).toBe(200);
    expect(usage.body.listen_seconds).toBe(120);
    expect(usage.body.ai_questions).toBe(1);
    expect(usage.body.limits.listen_minutes_per_month).toBeDefined();
    expect(usage.body.limits.ai_questions_per_month).toBeDefined();
  });

  it('shows an active voice session with the member name resolved (premium)', async () => {
    const { app, rest } = scenario();
    rest.membersList.set('g1', [{ id: 'm7', username: 'Faisal', avatar: null, joined_at: '2026-01-01T00:00:00Z' }]);
    rest.voiceChannels.set('g1', [{ id: 'vc1', name: 'Lobby' }]);
    await startVoiceSession('g1', 'm7', 'vc1');
    const agent = await login(app);

    // voice log is premium-gated
    await unlinkGuild('linker', 'g1');
    expect((await agent.get('/api/guilds/g1/voice-log')).status).toBe(403);
    await linkGuild('linker', 'g1');

    const log = await agent.get('/api/guilds/g1/voice-log');
    expect(log.status).toBe(200);
    expect(log.body.active).toHaveLength(1);
    expect(log.body.active[0]).toMatchObject({ user_id: 'm7', name: 'Faisal', channel_name: 'Lobby' });
  });

  it('returns a coherent stats payload for the default window', async () => {
    const { app, rest } = scenario();
    rest.membersList.set('g1', [
      { id: 'm1', username: 'A', avatar: null, joined_at: '2026-07-01T00:00:00Z' },
      { id: 'm2', username: 'B', avatar: null, joined_at: '2026-07-05T00:00:00Z' },
    ]);
    rest.guildCounts.set('g1', 2);
    const agent = await login(app);

    const stats = await agent.get('/api/guilds/g1/stats?days=30');
    expect(stats.status).toBe(200);
    expect(stats.body.memberCount).toBe(2);
    expect(Array.isArray(stats.body.memberSeries)).toBe(true);
    expect(stats.body.messagesDaily).toHaveLength(30);
    expect(stats.body.totals).toBeDefined();

    expect((await agent.get('/api/guilds/g1/stats?days=999')).status).toBe(400); // invalid window
  });

  it('reports bot online/offline via the status endpoint', async () => {
    const { app } = scenario();
    const agent = await login(app);
    await clearBotHeartbeat();
    expect((await agent.get('/api/status')).body.online).toBe(false);
    await recordBotHeartbeat(3);
    const online = await agent.get('/api/status');
    expect(online.body.online).toBe(true);
    expect(online.body.guild_count).toBe(3);
  });
});
