import { activityScore } from '@gamebot/shared';
import { ActivityDailyModel } from '../models.js';
import { retryOnDupKey } from '../retry.js';

function cutoffKey(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function bump(guildId: string, userId: string, dateKey: string, field: 'messages' | 'reactions' | 'voice_seconds', n: number): Promise<void> {
  await retryOnDupKey(() => ActivityDailyModel.updateOne(
    { guild_id: guildId, user_id: userId, date: dateKey },
    { $inc: { [field]: n } },
    { upsert: true, setDefaultsOnInsert: true },
  ));
}

export const recordMessage = (g: string, u: string, d: string) => bump(g, u, d, 'messages', 1);
export const recordReaction = (g: string, u: string, d: string) => bump(g, u, d, 'reactions', 1);
export const addVoiceSeconds = (g: string, u: string, d: string, s: number) =>
  s > 0 ? bump(g, u, d, 'voice_seconds', Math.round(s)) : Promise.resolve();

/** User ids with ANY recorded activity (message/reaction/voice) in the window. */
export async function activeUserIds(guildId: string, days: number): Promise<string[]> {
  return ActivityDailyModel.find({ guild_id: guildId, date: { $gte: cutoffKey(days) } }).distinct(
    'user_id',
  ) as Promise<string[]>;
}

export async function topActive(
  guildId: string,
  days: number,
  limit = 5,
): Promise<{ user_id: string; messages: number; voice_seconds: number; reactions: number; score: number }[]> {
  const rows = await ActivityDailyModel.aggregate<{ _id: string; messages: number; voice_seconds: number; reactions: number }>([
    { $match: { guild_id: guildId, date: { $gte: cutoffKey(days) } } },
    { $group: { _id: '$user_id', messages: { $sum: '$messages' }, voice_seconds: { $sum: '$voice_seconds' }, reactions: { $sum: '$reactions' } } },
  ]);
  return rows
    .map((r) => ({ user_id: r._id, messages: r.messages, voice_seconds: r.voice_seconds, reactions: r.reactions, score: activityScore(r) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function activityDaily(
  guildId: string,
  days: number,
): Promise<{ date: string; messages: number; voice_seconds: number; reactions: number }[]> {
  const rows = await ActivityDailyModel.aggregate<{ _id: string; messages: number; voice_seconds: number; reactions: number }>([
    { $match: { guild_id: guildId, date: { $gte: cutoffKey(days) } } },
    { $group: { _id: '$date', messages: { $sum: '$messages' }, voice_seconds: { $sum: '$voice_seconds' }, reactions: { $sum: '$reactions' } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, messages: r.messages, voice_seconds: r.voice_seconds, reactions: r.reactions }));
}
