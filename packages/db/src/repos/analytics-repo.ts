import { MemberSnapshotModel } from '../models.js';
import { retryOnDupKey } from '../retry.js';

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
  await retryOnDupKey(() => MemberSnapshotModel.updateOne(
    { guild_id: guildId, date: dateKey },
    { $set: { member_count: count } },
    { upsert: true },
  ));
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
