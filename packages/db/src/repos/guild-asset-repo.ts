import { GuildAssetModel, type GuildAssetDoc, type GuildAssetKind } from '../models.js';
import { retryOnDupKey } from '../retry.js';

// Assets live in their own collection (one doc per guild+kind); cap them well
// below Mongo's 16 MB document limit so a write can never hit it.
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

export interface GuildAsset {
  content_type: string;
  data: Buffer;
  updated_at: Date;
}

export async function putGuildAsset(
  guildId: string,
  kind: GuildAssetKind,
  contentType: string,
  data: Buffer,
): Promise<void> {
  if (data.length === 0) throw new Error('asset is empty');
  if (data.length > MAX_ASSET_BYTES) throw new Error('asset exceeds size limit');
  await retryOnDupKey(() => GuildAssetModel.updateOne(
    { guild_id: guildId, kind },
    { $set: { content_type: contentType, data } },
    { upsert: true },
  ));
}

export async function getGuildAsset(guildId: string, kind: GuildAssetKind): Promise<GuildAsset | null> {
  const doc = (await GuildAssetModel.findOne({ guild_id: guildId, kind }).lean()) as GuildAssetDoc | null;
  if (!doc) return null;
  // lean() returns the stored binary as a mongoose Binary wrapper; normalize to Buffer.
  const raw = doc.data as unknown as { buffer?: Uint8Array } | Uint8Array;
  const data = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from((raw as { buffer?: Uint8Array }).buffer ?? (raw as Uint8Array));
  return { content_type: doc.content_type, data, updated_at: doc.updated_at };
}

export async function deleteGuildAsset(guildId: string, kind: GuildAssetKind): Promise<void> {
  await GuildAssetModel.deleteOne({ guild_id: guildId, kind });
}
