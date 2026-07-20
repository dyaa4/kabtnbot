import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, hasOrganizeSnapshot } from '@gamebot/db';
import { FakeDiscordRest } from './testing/fake-rest.js';
import { applyOrganizePlan, undoOrganize } from './channel-apply.js';
import { DiscordApiError } from './discord-rest.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

function guildWithChannels() {
  const rest = new FakeDiscordRest();
  rest.allChannels.set('g1', [
    { id: 'catA', name: 'General', type: 4, position: 0, parent_id: null },
    { id: 'c1', name: 'general', type: 0, position: 0, parent_id: 'catA' },
    { id: 'c2', name: 'random', type: 0, position: 1, parent_id: 'catA' },
    { id: 'c3', name: 'Voice 1', type: 2, position: 2, parent_id: null },
  ]);
  return rest;
}

const PLAN = {
  categories: [
    { name: '💬 Chat', channels: [{ id: 'c1', name: '💬 general' }, { id: 'c2', name: '🎲 random' }] },
    { name: '🔊 Voice', channels: [{ id: 'c3', name: '🔊 Voice 1' }] },
  ],
};

describe('applyOrganizePlan / undoOrganize', () => {
  beforeEach(async () => {
    // Ensure a clean snapshot between cases.
    await undoOrganize(new FakeDiscordRest(), 'g1').catch(() => {});
  });

  it('reuses a category, creates the extra, reparents/renames, and saves an undo snapshot', async () => {
    const rest = guildWithChannels();
    const result = await applyOrganizePlan(rest, 'g1', PLAN, 'Other');

    expect(result.categoriesCreated).toBe(1);
    expect(result.failures).toBe(0);

    const now = new Map(rest.allChannels.get('g1')!.map((c) => [c.id, c]));
    // catA reused + renamed to the first plan category.
    expect(now.get('catA')!.name).toBe('💬 Chat');
    expect(now.get('catA')!.parent_id).toBeNull();
    // Text channels sanitized (lowercase + hyphens), reparented under catA.
    expect(now.get('c1')!.name).toBe('💬-general');
    expect(now.get('c1')!.parent_id).toBe('catA');
    expect(now.get('c2')!.name).toBe('🎲-random');
    // The extra category was created and c3 (voice, name kept) moved under it.
    const created = rest.allChannels.get('g1')!.find((c) => c.type === 4 && c.name === '🔊 Voice');
    expect(created).toBeDefined();
    expect(now.get('c3')!.parent_id).toBe(created!.id);
    expect(now.get('c3')!.name).toBe('🔊 Voice 1');

    expect(await hasOrganizeSnapshot('g1')).toBe(true);
  });

  it('undo restores original names/parents/positions and deletes the created category', async () => {
    const rest = guildWithChannels();
    await applyOrganizePlan(rest, 'g1', PLAN, 'Other');
    const done = await undoOrganize(rest, 'g1');
    expect(done).toBe(true);

    const now = new Map(rest.allChannels.get('g1')!.map((c) => [c.id, c]));
    expect(now.get('catA')!.name).toBe('General');
    expect(now.get('c1')!.name).toBe('general');
    expect(now.get('c1')!.parent_id).toBe('catA');
    expect(now.get('c3')!.name).toBe('Voice 1');
    expect(now.get('c3')!.parent_id).toBeNull();
    // The category the apply created is gone.
    expect(rest.allChannels.get('g1')!.some((c) => c.type === 4 && c.name === '🔊 Voice')).toBe(false);
    expect(await hasOrganizeSnapshot('g1')).toBe(false);
  });

  it('undo is a no-op when there is no snapshot', async () => {
    expect(await undoOrganize(new FakeDiscordRest(), 'no-guild')).toBe(false);
  });

  it('surfaces a 403 when the bot lacks Manage Channels (no snapshot written)', async () => {
    const rest = guildWithChannels();
    rest.forbidManageChannels = true;
    await expect(applyOrganizePlan(rest, 'g1', PLAN, 'Other')).rejects.toBeInstanceOf(DiscordApiError);
    expect(await hasOrganizeSnapshot('g1')).toBe(false);
  });
});
