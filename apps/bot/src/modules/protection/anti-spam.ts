import type { GuildMember, Message, TextChannel } from 'discord.js';
import { normalizeText } from '@gamebot/shared';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { isGuildAdmin } from '../../lib/permissions.js';
import { t, fmt } from '../../lib/strings.js';

/**
 * Cross-channel spam: the same (normalized) content posted by one member into
 * several DIFFERENT channels within a minute. Every copy is deleted, the
 * sender gets one DM notice, and the moderation log channel gets one line.
 */
export const SPAM_WINDOW_MS = 60_000;
export const SPAM_CHANNEL_THRESHOLD = 3;

interface Copy {
  channelId: string;
  messageId: string;
  at: number;
}

// guildId:userId:foldedContent → recent copies (in-memory, like the strike
// maps — resets on restart, which is acceptable for a rate window of 60s).
const recent = new Map<string, Copy[]>();

/**
 * Track one posting of `key`'s content. Returns ALL tracked copies once the
 * burst reaches SPAM_CHANNEL_THRESHOLD distinct channels (and forgets the
 * key so the next copy starts a fresh window), else null.
 */
export function trackCrossPost(
  key: string,
  channelId: string,
  messageId: string,
  now: number = Date.now(),
): Copy[] | null {
  const copies = (recent.get(key) ?? []).filter((c) => now - c.at < SPAM_WINDOW_MS);
  copies.push({ channelId, messageId, at: now });
  if (new Set(copies.map((c) => c.channelId)).size >= SPAM_CHANNEL_THRESHOLD) {
    recent.delete(key);
    return copies;
  }
  recent.set(key, copies);
  return null;
}

export function clearSpamTracker(): void {
  recent.clear();
}

/** True when the message was part of a spam burst and has been handled. */
export async function handleAntiSpam(msg: Message): Promise<boolean> {
  if (!msg.guild || msg.author.bot || !msg.member) return false;
  const config = await getCachedGuildConfig(msg.guild.id);
  if (!config.protection.enabled || !config.protection.anti_spam) return false;
  if (isGuildAdmin(msg.member as GuildMember, config.admin_role_id)) return false;

  // Very short texts ("gg", "لول") repeat innocently across channels — skip.
  const folded = normalizeText(msg.content).trim();
  if (folded.length < 5) return false;

  const key = `${msg.guild.id}:${msg.author.id}:${folded.slice(0, 200)}`;
  const burst = trackCrossPost(key, msg.channelId, msg.id);
  if (!burst) return false;

  for (const copy of burst) {
    const channel = msg.guild.channels.cache.get(copy.channelId);
    if (channel?.isTextBased()) {
      await (channel as TextChannel).messages.delete(copy.messageId).catch(() => {});
    }
  }

  const strings = t(config.language);
  await msg.author.send({ content: fmt(strings.spamDmNotice, { server: msg.guild.name }) }).catch(() => {});

  if (config.protection.log_channel_id) {
    const log = msg.guild.channels.cache.get(config.protection.log_channel_id);
    if (log?.isTextBased()) {
      const count = new Set(burst.map((c) => c.channelId)).size;
      await (log as TextChannel)
        .send({
          content: fmt(strings.spamLogDeleted, { user: `<@${msg.author.id}>`, count }),
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }
  }
  return true;
}
