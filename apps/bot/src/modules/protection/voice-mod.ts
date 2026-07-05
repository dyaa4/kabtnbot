import type { Guild } from 'discord.js';
import { matchesProfanity } from '@gamebot/shared';
import { getGuildConfig } from '@gamebot/db';
import { playSpeech, type VoiceSession } from '../voice-ai/sessions.js';

const WINDOW_MS = 60 * 60 * 1000;

export class ProfanityTracker {
  private first = new Map<string, number>(); // key → first-offense ms within the current window

  register(guildId: string, userId: string, now: number): 'warn' | 'kick' {
    const key = `${guildId}:${userId}`;
    const firstAt = this.first.get(key);
    if (firstAt === undefined || now - firstAt > WINDOW_MS) {
      this.first.set(key, now);
      return 'warn';
    }
    this.first.delete(key); // reset after a kick
    return 'kick';
  }
}

const tracker = new ProfanityTracker();

export async function handleTranscriptModeration(
  guild: Guild,
  _session: VoiceSession,
  userId: string,
  text: string,
  now: () => number = Date.now,
): Promise<boolean> {
  const config = await getGuildConfig(guild.id);
  if (!config.protection.enabled || !config.protection.voice_moderation) return false;
  if (!matchesProfanity(text, config.protection.custom_words)) return false;

  const member = guild.members.cache.get(userId);
  const name = member?.displayName ?? 'عضو';
  const action = tracker.register(guild.id, userId, now());
  if (action === 'warn') {
    await playSpeech(guild.id, `يا ${name}، انتبه لألفاظك من فضلك.`).catch(() => {});
  } else {
    await playSpeech(guild.id, `يا ${name}، تم إخراجك بسبب تكرار الألفاظ.`).catch(() => {});
    await member?.voice.disconnect().catch(() => {});
  }
  return true;
}
