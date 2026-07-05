import { MatchModel, PlayerModel, UsageModel, MemberSnapshotModel } from '../models.js';

function dateKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function cutoffDate(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function cutoffKey(days: number): string {
  return dateKeyOf(cutoffDate(days));
}

export async function recordMemberSnapshot(guildId: string, count: number, dateKey: string): Promise<void> {
  await MemberSnapshotModel.updateOne(
    { guild_id: guildId, date: dateKey },
    { $set: { member_count: count } },
    { upsert: true },
  );
}

export async function memberSnapshots(
  guildId: string,
  days: number,
): Promise<{ date: string; member_count: number }[]> {
  const docs = await MemberSnapshotModel.find({ guild_id: guildId, date: { $gte: cutoffKey(days) } })
    .sort({ date: 1 })
    .lean();
  return docs.map((d) => ({ date: d.date, member_count: d.member_count }));
}

export async function matchesPerDay(guildId: string, days: number): Promise<{ date: string; count: number }[]> {
  const results = await MatchModel.aggregate([
    { $match: { guild_id: guildId, status: 'completed', completed_at: { $gte: cutoffDate(days) } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completed_at' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return results.map((r) => ({ date: r._id as string, count: r.count as number }));
}

export async function aiUsageDaily(
  guildId: string,
  days: number,
): Promise<{ date: string; ai_questions: number; listen_seconds: number }[]> {
  const docs = await UsageModel.find({ guild_id: guildId, date: { $gte: cutoffKey(days) } })
    .sort({ date: 1 })
    .lean();
  return docs.map((d) => ({ date: d.date, ai_questions: d.ai_questions, listen_seconds: d.listen_seconds }));
}

export async function newPlayersPerDay(guildId: string, days: number): Promise<{ date: string; count: number }[]> {
  const results = await PlayerModel.aggregate([
    { $match: { guild_id: guildId, created_at: { $gte: cutoffDate(days) } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return results.map((r) => ({ date: r._id as string, count: r.count as number }));
}
