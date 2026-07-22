import type { Message, TextChannel } from 'discord.js';
import { normalizeText } from '@gamebot/shared';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { t, fmt } from '../../lib/strings.js';

/**
 * Cross-channel spam: the same content (text AND/OR the same image/sticker)
 * posted by one member into several DIFFERENT channels within a minute. Every
 * copy is deleted, the sender gets one DM notice, and the moderation log gets
 * one line. Applies to EVERYONE, admins included (owner decision) — a mass
 * cross-post is spam no matter who sends it.
 */
export const SPAM_WINDOW_MS = 60_000;
export const SPAM_CHANNEL_THRESHOLD = 3;

interface Copy {
  channelId: string;
  messageId: string;
  at: number;
}

interface Bucket {
  copies: Copy[];
  flagged: boolean; // the burst threshold has already been crossed this window
}

/** Result of tracking one post: which copies to delete, and whether this is the
 * FIRST time the burst tripped (so the DM/log fires only once). */
export interface SpamHit {
  copies: Copy[];
  firstHit: boolean;
}

// guildId:userId:signature → recent copies (in-memory, like the strike maps —
// resets on restart, acceptable for a 60s rate window).
const recent = new Map<string, Bucket>();

/**
 * Track one posting of `key`'s content.
 *  - Below the threshold → null.
 *  - The moment it reaches SPAM_CHANNEL_THRESHOLD distinct channels → returns
 *    ALL copies so far with firstHit=true (delete the burst + notify once).
 *  - Every FURTHER copy while the window is still hot → returns just that copy
 *    with firstHit=false, so a blast into 10 channels is fully cleaned, not only
 *    the first three.
 */
export function trackCrossPost(
  key: string,
  channelId: string,
  messageId: string,
  now: number = Date.now(),
): SpamHit | null {
  const prev = recent.get(key);
  const copies = (prev?.copies ?? []).filter((c) => now - c.at < SPAM_WINDOW_MS);
  const copy: Copy = { channelId, messageId, at: now };
  copies.push(copy);

  if (prev?.flagged) {
    recent.set(key, { copies, flagged: true });
    return { copies: [copy], firstHit: false };
  }
  if (new Set(copies.map((c) => c.channelId)).size >= SPAM_CHANNEL_THRESHOLD) {
    recent.set(key, { copies, flagged: true });
    return { copies, firstHit: true };
  }
  recent.set(key, { copies, flagged: false });
  return null;
}

export function clearSpamTracker(): void {
  recent.clear();
}

/** A short, stable fingerprint of a message's content — text plus any image
 * attachments (name+size) and stickers — so an image with no caption is caught
 * too. Empty when there is nothing to fingerprint. */
export function spamSignature(msg: Message): string {
  const parts: string[] = [];
  const folded = normalizeText(msg.content).trim();
  if (folded) parts.push(folded);
  for (const a of msg.attachments.values()) parts.push(`att:${a.name ?? ''}:${a.size}`);
  for (const s of msg.stickers.values()) parts.push(`stk:${s.id}`);
  return parts.join('|');
}

/** True when the message was part of a spam burst and has been handled. */
export async function handleAntiSpam(msg: Message): Promise<boolean> {
  if (!msg.guild || msg.author.bot || !msg.member) return false;
  const config = await getCachedGuildConfig(msg.guild.id);
  if (!config.protection.enabled || !config.protection.anti_spam) return false;
  // NOTE: no admin exemption — spam protection applies to everyone, admins
  // included (owner decision). Mass cross-posting is spam regardless of role.

  const signature = spamSignature(msg);
  if (!signature) return false; // nothing to fingerprint (empty message)
  // Very short PLAIN texts ("gg", "لول") repeat innocently across channels; skip
  // them — but never skip a message that carries an image/sticker.
  if (msg.attachments.size === 0 && msg.stickers.size === 0 && signature.length < 5) return false;

  const key = `${msg.guild.id}:${msg.author.id}:${signature.slice(0, 200)}`;
  const hit = trackCrossPost(key, msg.channelId, msg.id);
  if (!hit) return false;

  let failed = 0;
  for (const copy of hit.copies) {
    const channel = msg.guild.channels.cache.get(copy.channelId);
    if (channel?.isTextBased()) {
      await (channel as TextChannel).messages.delete(copy.messageId).catch(() => {
        failed += 1;
      });
    }
  }
  console.log(
    `[AntiSpam ${msg.guild.id}] burst from ${msg.author.id}: deleted ${hit.copies.length - failed}/${hit.copies.length} copies` +
      (failed > 0 ? ' (delete failures — check the Manage Messages permission)' : ''),
  );

  // DM + log only once per burst, not for every mopped-up copy.
  if (!hit.firstHit) return true;

  const strings = t(config.language);
  await msg.author.send({ content: fmt(strings.spamDmNotice, { server: msg.guild.name }) }).catch(() => {});

  if (config.protection.log_channel_id) {
    const log = msg.guild.channels.cache.get(config.protection.log_channel_id);
    if (log?.isTextBased()) {
      const count = new Set(hit.copies.map((c) => c.channelId)).size;
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
