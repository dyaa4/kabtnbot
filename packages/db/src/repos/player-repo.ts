import { PlayerModel, type PlayerDoc } from '../models.js';

export async function getPlayer(guildId: string, userId: string): Promise<PlayerDoc | null> {
  return PlayerModel.findOne({ guild_id: guildId, user_id: userId }).lean();
}

export async function topPlayers(guildId: string, limit = 10): Promise<PlayerDoc[]> {
  return PlayerModel.find({ guild_id: guildId }).sort({ points: -1 }).limit(limit).lean();
}

export async function getPointsMap(guildId: string, userIds: string[]): Promise<Map<string, number>> {
  const docs = await PlayerModel.find({ guild_id: guildId, user_id: { $in: userIds } }).lean();
  const map = new Map<string, number>();
  for (const id of userIds) map.set(id, 0);
  for (const d of docs) map.set(d.user_id, d.points);
  return map;
}

export async function applyMatchResult(
  guildId: string,
  winnerIds: string[],
  loserIds: string[],
  winPoints: number,
  lossPoints: number,
): Promise<void> {
  const now = new Date();
  const ops = [
    ...winnerIds.map((userId) => ({
      updateOne: {
        filter: { guild_id: guildId, user_id: userId },
        update: { $inc: { points: winPoints, wins: 1 }, $set: { last_played: now } },
        upsert: true,
      },
    })),
    ...loserIds.map((userId) => ({
      updateOne: {
        filter: { guild_id: guildId, user_id: userId },
        update: { $inc: { points: lossPoints, losses: 1 }, $set: { last_played: now } },
        upsert: true,
      },
    })),
  ];
  if (ops.length > 0) await PlayerModel.bulkWrite(ops);
}

export async function adjustPlayerPoints(guildId: string, userId: string, delta: number): Promise<PlayerDoc> {
  const doc = await PlayerModel.findOneAndUpdate(
    { guild_id: guildId, user_id: userId },
    { $inc: { points: delta } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return doc as PlayerDoc;
}
