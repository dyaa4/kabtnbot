import { MatchModel, PlayerModel, UsageModel, MemberSnapshotModel } from '../models.js';

function dateKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Inclusive window contract: callers render exactly `days` calendar days, from
// (today - days + 1) through today inclusive. The cutoff must therefore land on
// (today - days + 1), not (today - days), or the earliest rendered day's data is dropped.
// Floored to UTC midnight (matching dateKeyOf's UTC keying) so timestamp comparisons
// include the ENTIRE first rendered day, not just the part after the query's time-of-day.
function cutoffDate(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  d.setUTCHours(0, 0, 0, 0);
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

export async function mostActivePlayers(
  guildId: string,
  days: number,
  limit = 5,
): Promise<{ user_id: string; matches: number }[]> {
  const results = await MatchModel.aggregate([
    { $match: { guild_id: guildId, status: 'completed', completed_at: { $gte: cutoffDate(days) } } },
    { $project: { players: { $concatArrays: ['$team_a', '$team_b'] } } },
    { $unwind: '$players' },
    { $group: { _id: '$players', matches: { $sum: 1 } } },
    { $sort: { matches: -1 } },
    { $limit: limit },
  ]);
  return results.map((r) => ({ user_id: r._id as string, matches: r.matches as number }));
}
