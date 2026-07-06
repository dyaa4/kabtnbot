import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from './connect.js';
import { updateGuildConfig, getGuildConfigRead } from './repos/guild-config-repo.js';
import { putGuildAsset, getGuildAsset, deleteGuildAsset } from './repos/guild-asset-repo.js';
import { setKv, getKv } from './repos/kv-repo.js';
import { exportBackup, importBackup } from './backup.js';
import { GuildConfigModel } from './models.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('backup export/import', () => {
  it('round-trips configs, binary assets and kv entries', async () => {
    await updateGuildConfig('gB', { welcome: { message: 'مرحباً {user}' }, protection: { enabled: true } });
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 255, 0, 128]);
    await putGuildAsset('gB', 'welcome_banner', 'image/png', imageBytes);
    await setKv('commands_hash:test', 'abc123');

    const backup = await exportBackup(new Date('2026-07-11T00:00:00Z'));
    expect(backup.version).toBe(1);
    expect(backup.exported_at).toBe('2026-07-11T00:00:00.000Z');
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup); // JSON-serializable

    // wipe, then restore from the serialized form (as the CLI would)
    await GuildConfigModel.deleteMany({ guild_id: 'gB' });
    await deleteGuildAsset('gB', 'welcome_banner');
    await setKv('commands_hash:test', 'overwritten');

    const counts = await importBackup(JSON.parse(JSON.stringify(backup)));
    expect(counts.configs).toBeGreaterThanOrEqual(1);

    expect((await getGuildConfigRead('gB')).welcome.message).toBe('مرحباً {user}');
    expect((await getGuildConfigRead('gB')).protection.enabled).toBe(true);
    const asset = await getGuildAsset('gB', 'welcome_banner');
    expect(asset?.content_type).toBe('image/png');
    expect(Buffer.compare(asset!.data, imageBytes)).toBe(0); // byte-exact binary restore
    expect(await getKv('commands_hash:test')).toBe('abc123');
  });

  it('rejects backups from an unknown format version', async () => {
    await expect(
      importBackup({ version: 2 as never, exported_at: '', guild_configs: [], guild_assets: [], kv: [] }),
    ).rejects.toThrow(/version/);
  });
});
