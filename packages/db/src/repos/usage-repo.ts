import { UsageModel } from '../models.js';
import { retryOnDupKey } from '../retry.js';

export async function incrementListenSeconds(guildId: string, seconds: number, dateKey: string): Promise<void> {
  await retryOnDupKey(() => UsageModel.updateOne(
    { guild_id: guildId, date: dateKey },
    { $inc: { listen_seconds: seconds } },
    { upsert: true },
  ));
}

export async function incrementAiQuestions(guildId: string, dateKey: string): Promise<void> {
  await retryOnDupKey(() => UsageModel.updateOne(
    { guild_id: guildId, date: dateKey },
    { $inc: { ai_questions: 1 } },
    { upsert: true },
  ));
}

/**
 * Atomically consumes one AI question and returns the NEW total. The caller
 * compares against the limit and refunds on overshoot — check-then-increment
 * across two round trips would let concurrent calls both pass the check.
 */
export async function consumeAiQuestion(guildId: string, dateKey: string): Promise<number> {
  const doc = await retryOnDupKey(() => UsageModel.findOneAndUpdate(
    { guild_id: guildId, date: dateKey },
    { $inc: { ai_questions: 1 } },
    { upsert: true, new: true },
  ).lean());
  return doc?.ai_questions ?? 1;
}

/** Rolls back a consumeAiQuestion that overshot the daily limit. */
export async function refundAiQuestion(guildId: string, dateKey: string): Promise<void> {
  await UsageModel.updateOne({ guild_id: guildId, date: dateKey }, { $inc: { ai_questions: -1 } });
}

export async function getUsage(guildId: string, dateKey: string): Promise<{ listen_seconds: number; ai_questions: number }> {
  const doc = await UsageModel.findOne({ guild_id: guildId, date: dateKey }).lean();
  return { listen_seconds: doc?.listen_seconds ?? 0, ai_questions: doc?.ai_questions ?? 0 };
}
