import { OrganizeSnapshotModel, type OrganizeSnapshotDoc } from '../models.js';

export type OrganizeSnapshot = Pick<OrganizeSnapshotDoc, 'channels' | 'created_category_ids'>;

/** Store the pre-apply layout for a guild, replacing any previous snapshot
 * (only the latest apply is undoable) and resetting the 24h expiry. */
export async function saveOrganizeSnapshot(guildId: string, snapshot: OrganizeSnapshot): Promise<void> {
  await OrganizeSnapshotModel.findOneAndUpdate(
    { guild_id: guildId },
    { ...snapshot, created_at: new Date() },
    { upsert: true },
  ).lean();
}

export async function getOrganizeSnapshot(guildId: string): Promise<OrganizeSnapshot | null> {
  const doc = await OrganizeSnapshotModel.findOne({ guild_id: guildId }).lean();
  return doc ? { channels: doc.channels, created_category_ids: doc.created_category_ids } : null;
}

export async function hasOrganizeSnapshot(guildId: string): Promise<boolean> {
  return (await OrganizeSnapshotModel.countDocuments({ guild_id: guildId }).limit(1)) > 0;
}

export async function clearOrganizeSnapshot(guildId: string): Promise<void> {
  await OrganizeSnapshotModel.deleteOne({ guild_id: guildId });
}
