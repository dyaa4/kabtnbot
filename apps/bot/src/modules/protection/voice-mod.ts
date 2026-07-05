import type { Guild, TextChannel } from 'discord.js';
import { matchesProfanity } from '@gamebot/shared';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
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

/**
 * Where to post a visible moderation notice: the configured log channel if it
 * exists and is text-based, else the guild's system channel, else the first
 * usable text channel. Returns null if nothing usable exists.
 */
export function resolveModerationChannel(
  guild: Guild,
  logChannelId: string | null,
): { send: (content: string) => Promise<unknown> } | null {
  const isText = (c: unknown): c is TextChannel =>
    !!c && typeof (c as { isTextBased?: () => boolean }).isTextBased === 'function' && (c as TextChannel).isTextBased();

  if (logChannelId) {
    const c = guild.channels.cache.get(logChannelId);
    if (isText(c)) return c as unknown as { send: (content: string) => Promise<unknown> };
  }
  if (isText(guild.systemChannel)) {
    return guild.systemChannel as unknown as { send: (content: string) => Promise<unknown> };
  }
  for (const c of guild.channels.cache.values()) {
    if (isText(c)) return c as unknown as { send: (content: string) => Promise<unknown> };
  }
  return null;
}

const tracker = new ProfanityTracker();

export async function handleTranscriptModeration(
  guild: Guild,
  _session: VoiceSession,
  userId: string,
  text: string,
  now: () => number = Date.now,
): Promise<boolean> {
  const config = await getCachedGuildConfig(guild.id);
  if (!config.protection.enabled || !config.protection.voice_moderation) return false;
  if (!matchesProfanity(text, config.protection.custom_words)) return false;

  const member = guild.members.cache.get(userId);
  const name = member?.displayName ?? 'عضو';
  const channel = resolveModerationChannel(guild, config.protection.log_channel_id);
  const action = tracker.register(guild.id, userId, now());

  if (action === 'warn') {
    // Text notice works even without TTS; spoken warning is best-effort.
    await channel?.send(`⚠️ <@${userId}> تنبيه: لغة غير لائقة في الصوت. عند التكرار سيتم إخراجك.`).catch(() => {});
    await playSpeech(guild.id, `يا ${name}، انتبه لألفاظك من فضلك.`).catch(() => {});
  } else {
    await channel?.send(`🚫 تم إخراج <@${userId}> من الصوت بسبب تكرار الألفاظ غير اللائقة.`).catch(() => {});
    await playSpeech(guild.id, `يا ${name}، تم إخراجك بسبب تكرار الألفاظ.`).catch(() => {});
    await member?.voice.disconnect().catch(() => {});
  }
  return true;
}
