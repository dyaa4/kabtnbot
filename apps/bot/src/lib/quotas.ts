import { getGuildConfig, getUsage, incrementAiQuestions, incrementListenSeconds } from '@gamebot/db';

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function tryConsumeAiQuestion(guildId: string): Promise<boolean> {
  const [config, usage] = await Promise.all([
    getGuildConfig(guildId),
    getUsage(guildId, todayKey()),
  ]);
  if (usage.ai_questions >= config.quotas.ai_questions_per_day) return false;
  await incrementAiQuestions(guildId, todayKey());
  return true;
}

export async function addListenSeconds(guildId: string, seconds: number): Promise<void> {
  if (seconds > 0) await incrementListenSeconds(guildId, Math.round(seconds), todayKey());
}

export async function isListenQuotaExceeded(guildId: string): Promise<boolean> {
  const [config, usage] = await Promise.all([
    getGuildConfig(guildId),
    getUsage(guildId, todayKey()),
  ]);
  return usage.listen_seconds >= config.quotas.listen_minutes_per_day * 60;
}
