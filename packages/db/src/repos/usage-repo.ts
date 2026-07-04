import { UsageModel } from '../models.js';

export async function incrementListenSeconds(guildId: string, seconds: number, dateKey: string): Promise<void> {
  await UsageModel.updateOne(
    { guild_id: guildId, date: dateKey },
    { $inc: { listen_seconds: seconds } },
    { upsert: true },
  );
}

export async function incrementAiQuestions(guildId: string, dateKey: string): Promise<void> {
  await UsageModel.updateOne(
    { guild_id: guildId, date: dateKey },
    { $inc: { ai_questions: 1 } },
    { upsert: true },
  );
}

export async function getUsage(guildId: string, dateKey: string): Promise<{ listen_seconds: number; ai_questions: number }> {
  const doc = await UsageModel.findOne({ guild_id: guildId, date: dateKey }).lean();
  return { listen_seconds: doc?.listen_seconds ?? 0, ai_questions: doc?.ai_questions ?? 0 };
}
