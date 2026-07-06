import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { getGuildConfig, getGuildConfigRead, updateGuildConfig } from './guild-config-repo.js';
import { incrementAiQuestions, incrementListenSeconds, getUsage } from './usage-repo.js';
import { putGuildAsset, getGuildAsset, deleteGuildAsset, MAX_ASSET_BYTES } from './guild-asset-repo.js';
import { recordBotHeartbeat, getBotStatus, BOT_OFFLINE_AFTER_MS } from './bot-status-repo.js';
import { getKv, setKv } from './kv-repo.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('guild-config-repo', () => {
  it('creates defaults on first access and persists patches', async () => {
    const c = await getGuildConfig('g1');
    expect(c.voice.wake_word).toBe('يا كابتن');
    const updated = await updateGuildConfig('g1', { voice: { dialect: 'syrian' } });
    expect(updated.voice.dialect).toBe('syrian');
    expect(updated.voice.wake_word).toBe('يا كابتن'); // merge, not replace
  });

  it('rejects invalid patches', async () => {
    await expect(updateGuildConfig('g1', { voice: { dialect: 'xx' } })).rejects.toThrow();
  });

  it('first access creates exactly one config document', async () => {
    await Promise.all([getGuildConfig('gRace'), getGuildConfig('gRace'), getGuildConfig('gRace')]);
    const { GuildConfigModel } = await import('../models.js');
    expect(await GuildConfigModel.countDocuments({ guild_id: 'gRace' })).toBe(1);
  });

  it('getGuildConfigRead returns defaults without creating a document, and reads updates', async () => {
    const { GuildConfigModel } = await import('../models.js');
    const c = await getGuildConfigRead('gReadOnly');
    expect(c.voice.wake_word).toBe('يا كابتن'); // defaults
    expect(await GuildConfigModel.countDocuments({ guild_id: 'gReadOnly' })).toBe(0); // no write
    await updateGuildConfig('gReadOnly', { protection: { custom_words: ['zzz'] } });
    expect((await getGuildConfigRead('gReadOnly')).protection.custom_words).toContain('zzz');
  });
});

describe('guild-asset-repo', () => {
  it('round-trips an asset and overwrites on re-upload', async () => {
    await putGuildAsset('gA', 'welcome_banner', 'image/png', Buffer.from([1, 2, 3]));
    const a = await getGuildAsset('gA', 'welcome_banner');
    expect(a?.content_type).toBe('image/png');
    expect(Buffer.compare(a!.data, Buffer.from([1, 2, 3]))).toBe(0);

    await putGuildAsset('gA', 'welcome_banner', 'image/jpeg', Buffer.from([9]));
    const b = await getGuildAsset('gA', 'welcome_banner');
    expect(b?.content_type).toBe('image/jpeg');
    expect(Buffer.compare(b!.data, Buffer.from([9]))).toBe(0);
  });

  it('returns null for missing assets and after delete', async () => {
    expect(await getGuildAsset('gNone', 'welcome_banner')).toBeNull();
    await putGuildAsset('gDel', 'welcome_banner', 'image/png', Buffer.from([5]));
    await deleteGuildAsset('gDel', 'welcome_banner');
    expect(await getGuildAsset('gDel', 'welcome_banner')).toBeNull();
  });

  it('rejects empty and oversized payloads', async () => {
    await expect(putGuildAsset('gBig', 'welcome_banner', 'image/png', Buffer.alloc(0))).rejects.toThrow();
    await expect(
      putGuildAsset('gBig', 'welcome_banner', 'image/png', Buffer.alloc(MAX_ASSET_BYTES + 1)),
    ).rejects.toThrow();
  });
});

describe('kv-repo', () => {
  it('returns null for unknown keys and round-trips values', async () => {
    expect(await getKv('nope')).toBeNull();
    await setKv('k1', 'v1');
    expect(await getKv('k1')).toBe('v1');
    await setKv('k1', 'v2'); // overwrite
    expect(await getKv('k1')).toBe('v2');
  });
});

describe('bot-status-repo', () => {
  it('reports offline with no heartbeat, online after one, offline once stale', async () => {
    expect((await getBotStatus()).online).toBe(false);

    await recordBotHeartbeat(7);
    const fresh = await getBotStatus();
    expect(fresh.online).toBe(true);
    expect(fresh.guild_count).toBe(7);
    expect(fresh.last_seen).toBeTruthy();

    const later = new Date(Date.now() + BOT_OFFLINE_AFTER_MS + 1000);
    expect((await getBotStatus(later)).online).toBe(false);
  });
});

describe('usage-repo', () => {
  it('accumulates per guild per day', async () => {
    await incrementAiQuestions('gU', '2026-07-04');
    await incrementAiQuestions('gU', '2026-07-04');
    await incrementListenSeconds('gU', 30, '2026-07-04');
    const u = await getUsage('gU', '2026-07-04');
    expect(u.ai_questions).toBe(2);
    expect(u.listen_seconds).toBe(30);
    expect((await getUsage('gU', '2026-07-05')).ai_questions).toBe(0);
  });
});
