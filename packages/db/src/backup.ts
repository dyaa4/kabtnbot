import { GuildConfigModel, GuildAssetModel, KvModel, type GuildAssetDoc, type KvDoc } from './models.js';

/**
 * Backup/restore for the irreplaceable data: guild configs, uploaded images
 * and the KV store. Analytics collections (usage, activity, snapshots, voice
 * sessions) are TTL-bound by design and intentionally not included.
 */

export interface BackupData {
  version: 1;
  exported_at: string;
  guild_configs: { guild_id: string; config: unknown }[];
  guild_assets: { guild_id: string; kind: string; content_type: string; data_base64: string }[];
  kv: { key: string; value: string }[];
}

/** lean() returns stored binaries as a mongoose Binary wrapper; normalize. */
function toBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  const wrapped = raw as { buffer?: Uint8Array };
  return Buffer.from(wrapped.buffer ?? (raw as Uint8Array));
}

export async function exportBackup(now: Date = new Date()): Promise<BackupData> {
  const [configs, assets, kv] = await Promise.all([
    GuildConfigModel.find().lean() as unknown as Promise<{ guild_id: string; config: unknown }[]>,
    GuildAssetModel.find().lean() as unknown as Promise<GuildAssetDoc[]>,
    KvModel.find().lean() as Promise<KvDoc[]>,
  ]);
  return {
    version: 1,
    exported_at: now.toISOString(),
    guild_configs: configs.map((c) => ({ guild_id: c.guild_id, config: c.config })),
    guild_assets: assets.map((a) => ({
      guild_id: a.guild_id,
      kind: a.kind,
      content_type: a.content_type,
      data_base64: toBuffer(a.data).toString('base64'),
    })),
    kv: kv.map((k) => ({ key: k.key, value: k.value })),
  };
}

export interface RestoreCounts {
  configs: number;
  assets: number;
  kv: number;
}

/** Merge-restore: upserts every backed-up document, leaves other docs alone. */
export async function importBackup(data: BackupData): Promise<RestoreCounts> {
  if (data.version !== 1) throw new Error(`Unsupported backup version: ${String(data.version)}`);
  for (const c of data.guild_configs) {
    await GuildConfigModel.updateOne({ guild_id: c.guild_id }, { $set: { config: c.config } }, { upsert: true });
  }
  for (const a of data.guild_assets) {
    await GuildAssetModel.updateOne(
      { guild_id: a.guild_id, kind: a.kind },
      { $set: { content_type: a.content_type, data: Buffer.from(a.data_base64, 'base64') } },
      { upsert: true },
    );
  }
  for (const k of data.kv) {
    await KvModel.updateOne({ key: k.key }, { $set: { value: k.value } }, { upsert: true });
  }
  return { configs: data.guild_configs.length, assets: data.guild_assets.length, kv: data.kv.length };
}
