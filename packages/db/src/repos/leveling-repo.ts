import { levelFromXp } from '@gamebot/shared';
import { MemberLevelModel } from '../models.js';

export interface XpResult {
  xp: number;
  level: number;
  leveledUp: boolean;
}

/**
 * Atomically grants XP and recomputes the member's level from the derived curve.
 * Returns the new totals plus whether this award crossed a level boundary.
 */
export async function addXp(guildId: string, userId: string, amount: number): Promise<XpResult> {
  const doc = await MemberLevelModel.findOneAndUpdate(
    { guild_id: guildId, user_id: userId },
    { $inc: { xp: amount } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  const xp = doc?.xp ?? amount;
  const storedLevel = doc?.level ?? 0;
  const level = levelFromXp(xp);
  const leveledUp = level > storedLevel;
  if (level !== storedLevel) {
    await MemberLevelModel.updateOne({ guild_id: guildId, user_id: userId }, { $set: { level } });
  }
  return { xp, level, leveledUp };
}

export async function getMemberLevel(guildId: string, userId: string): Promise<{ xp: number; level: number }> {
  const doc = await MemberLevelModel.findOne({ guild_id: guildId, user_id: userId }).lean();
  return { xp: doc?.xp ?? 0, level: doc?.level ?? 0 };
}

export async function topMembers(
  guildId: string,
  limit = 10,
): Promise<{ user_id: string; xp: number; level: number }[]> {
  const docs = await MemberLevelModel.find({ guild_id: guildId }).sort({ xp: -1 }).limit(limit).lean();
  return docs.map((d) => ({ user_id: d.user_id, xp: d.xp, level: d.level }));
}

/** 1-based rank of a member within the guild by XP; null if the member has no XP row. */
export async function getMemberRank(guildId: string, userId: string): Promise<number | null> {
  const me = await MemberLevelModel.findOne({ guild_id: guildId, user_id: userId }).lean();
  if (!me) return null;
  const ahead = await MemberLevelModel.countDocuments({ guild_id: guildId, xp: { $gt: me.xp } });
  return ahead + 1;
}
