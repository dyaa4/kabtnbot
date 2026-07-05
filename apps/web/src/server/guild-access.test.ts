import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, updateGuildConfig } from '@gamebot/db';
import { FakeDiscordRest } from './testing/fake-rest.js';
import { listEligibleGuilds, canManageGuild, clearAccessCache } from './guild-access.js';
import { encryptToken } from './crypto.js';
import type { Session } from './session.js';

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
const NONE = '0';

function makeSession(): Session {
  return { uid: 'u1', uname: 'x', avatar: null, eat: encryptToken('at-1') };
}

describe('guild access', () => {
  let rest: FakeDiscordRest;
  beforeEach(() => {
    clearAccessCache();
    rest = new FakeDiscordRest();
    rest.userGuilds.set('at-1', [
      { id: 'g-manage', name: 'A', icon: null, permissions: MANAGE },
      { id: 'g-role', name: 'B', icon: null, permissions: NONE },
      { id: 'g-nobot', name: 'C', icon: null, permissions: MANAGE },
      { id: 'g-none', name: 'D', icon: null, permissions: NONE },
    ]);
    rest.botGuilds.add('g-manage');
    rest.botGuilds.add('g-role');
    rest.botGuilds.add('g-none');
  });

  it('lists guilds with MANAGE_GUILD where bot is member', async () => {
    const list = await listEligibleGuilds(rest, makeSession());
    expect(list.map((g) => g.id)).toContain('g-manage');
    expect(list.map((g) => g.id)).not.toContain('g-nobot'); // bot absent
    expect(list.map((g) => g.id)).not.toContain('g-none'); // no permission
  });

  it('includes guilds via configured admin role', async () => {
    await updateGuildConfig('g-role', { customs: { admin_role_id: 'r9' } });
    rest.members.set('g-role:u1', { roles: ['r9'] });
    const list = await listEligibleGuilds(rest, makeSession());
    expect(list.map((g) => g.id)).toContain('g-role');
  });

  it('canManageGuild denies strangers and caches results', async () => {
    expect(await canManageGuild(rest, makeSession(), 'g-none')).toBe(false);
    expect(await canManageGuild(rest, makeSession(), 'g-manage')).toBe(true);
    // cache: removing bot membership does not flip the cached answer within TTL
    rest.botGuilds.delete('g-manage');
    expect(await canManageGuild(rest, makeSession(), 'g-manage')).toBe(true);
    clearAccessCache();
    expect(await canManageGuild(rest, makeSession(), 'g-manage')).toBe(false);
  });
});
