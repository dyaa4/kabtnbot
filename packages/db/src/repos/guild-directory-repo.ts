import { GuildDirectoryModel } from '../models.js';
import { retryOnDupKey } from '../retry.js';

export interface DirectoryEntry {
  guild_id: string;
  name: string;
  member_count: number;
  blocked: boolean;
  joined_at: Date;
  /** Discord user who added the bot (audit-log attribution); null = unknown. */
  invited_by: string | null;
}

/**
 * Upsert on join / ready-sync. `joined_at` and `blocked` are preserved across
 * syncs (only set on first insert); `left_at` is cleared since the bot is present.
 */
export async function recordGuildPresence(guildId: string, name: string, memberCount: number): Promise<void> {
  // guildCreate can race the ready-sync for the same guild — retry the loser.
  await retryOnDupKey(() => GuildDirectoryModel.updateOne(
    { guild_id: guildId },
    { $set: { name, member_count: memberCount, left_at: null }, $setOnInsert: { joined_at: new Date(), blocked: false } },
    { upsert: true },
  ));
}

export async function recordGuildLeave(guildId: string): Promise<void> {
  await GuildDirectoryModel.updateOne({ guild_id: guildId }, { $set: { left_at: new Date() } });
}

export async function listActiveGuilds(): Promise<DirectoryEntry[]> {
  const docs = await GuildDirectoryModel.find({ left_at: null }).sort({ joined_at: -1 }).lean();
  return docs.map((d) => ({
    guild_id: d.guild_id,
    name: d.name,
    member_count: d.member_count,
    blocked: d.blocked,
    joined_at: d.joined_at,
    invited_by: d.invited_by ?? null,
  }));
}

/** Audit-log attribution: which user added the bot to this guild. */
export async function recordGuildInviter(guildId: string, userId: string): Promise<void> {
  await retryOnDupKey(() => GuildDirectoryModel.updateOne(
    { guild_id: guildId },
    { $set: { invited_by: userId } },
    { upsert: true },
  ));
}

/**
 * Active guilds this user added the bot to. `excludeGuildId` lets the join-time
 * cap check count the OTHER guilds (the joining guild is already recorded).
 */
export async function countActiveInvitedGuilds(userId: string, excludeGuildId?: string): Promise<number> {
  return GuildDirectoryModel.countDocuments({
    invited_by: userId,
    left_at: null,
    ...(excludeGuildId ? { guild_id: { $ne: excludeGuildId } } : {}),
  });
}

export async function setGuildBlocked(guildId: string, blocked: boolean): Promise<void> {
  await retryOnDupKey(() => GuildDirectoryModel.updateOne({ guild_id: guildId }, { $set: { blocked } }, { upsert: true }));
}

export async function isGuildBlocked(guildId: string): Promise<boolean> {
  const doc = await GuildDirectoryModel.findOne({ guild_id: guildId }).lean();
  return doc?.blocked === true;
}
