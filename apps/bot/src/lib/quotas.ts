import { getGuildConfig, getUsage, incrementAiQuestions, incrementListenSeconds } from '@gamebot/db';
import { effectiveQuotas, todayKey } from '@gamebot/shared';

export { todayKey };

export async function tryConsumeAiQuestion(guildId: string): Promise<boolean> {
  const [config, usage] = await Promise.all([
    getGuildConfig(guildId),
    getUsage(guildId, todayKey()),
  ]);
  if (usage.ai_questions >= effectiveQuotas(config).ai_questions_per_day) return false;
  await incrementAiQuestions(guildId, todayKey());
  return true;
}

export async function addListenSeconds(guildId: string, seconds: number): Promise<void> {
  if (seconds > 0) await incrementListenSeconds(guildId, Math.ceil(seconds), todayKey());
}

export async function isListenQuotaExceeded(guildId: string): Promise<boolean> {
  const [config, usage] = await Promise.all([
    getGuildConfig(guildId),
    getUsage(guildId, todayKey()),
  ]);
  return usage.listen_seconds >= effectiveQuotas(config).listen_minutes_per_day * 60;
}
