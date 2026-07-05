import type { Guild, TextChannel } from 'discord.js';
import { matchesProfanity } from '@gamebot/shared';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { playSpeech, type VoiceSession } from '../voice-ai/sessions.js';

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

export async function handleTranscriptModeration(
  guild: Guild,
  _session: VoiceSession,
  userId: string,
  text: string,
): Promise<boolean> {
  const config = await getCachedGuildConfig(guild.id);
  if (!config.protection.enabled || !config.protection.voice_moderation) {
    console.log(
      `[Mod ${guild.id}] skip: protection.enabled=${config.protection.enabled} voice_moderation=${config.protection.voice_moderation}`,
    );
    return false;
  }
  if (!matchesProfanity(text, config.protection.custom_words)) {
    console.log(`[Mod ${guild.id}] no match: "${text}" (custom_words=${JSON.stringify(config.protection.custom_words)})`);
    return false;
  }

  const member = guild.members.cache.get(userId);
  const name = member?.displayName ?? 'عضو';
  const channel = resolveModerationChannel(guild, config.protection.log_channel_id);
  console.log(`[Mod ${guild.id}] MATCH → kicking ${userId}; notice channel=${channel ? 'found' : 'none'}`);

  // Attempt the kick FIRST, then post a notice reflecting what actually happened.
  // A disconnect can fail on role hierarchy (bot role must be above the target)
  // or a missing Move Members permission — surface that instead of falsely
  // claiming the member was removed.
  let kicked = false;
  try {
    await member?.voice.disconnect();
    kicked = true;
  } catch (e) {
    console.error('[Mod] disconnect failed (role hierarchy / Move Members perm):', (e as Error)?.message ?? e);
  }

  const notice = kicked
    ? `🚫 تم إخراج <@${userId}> من الصوت بسبب ألفاظ غير لائقة.`
    : `⚠️ رصدت ألفاظاً من <@${userId}> لكن تعذّر إخراجه — تأكد أن رتبة البوت أعلى من رتبته ولديه صلاحية «نقل الأعضاء».`;
  await channel?.send(notice).catch((e) => console.error('[Mod] send failed (needs Send Messages perm?):', (e as Error)?.message ?? e));
  if (kicked) await playSpeech(guild.id, `يا ${name}، تم إخراجك بسبب الألفاظ غير اللائقة.`).catch(() => {});
  return true;
}
