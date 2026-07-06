import { type Client, type GuildMember, type Message, type PartialMessage, type TextChannel } from 'discord.js';
import { scanMessage } from '@gamebot/shared';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { isGuildAdmin } from '../../lib/permissions.js';
import type { GuildConfig } from '@gamebot/shared';

export function shouldModerate(config: GuildConfig, isAdmin: boolean): boolean {
  return config.protection.enabled && config.protection.text_protection && !isAdmin;
}

/**
 * Whether an edit needs rescanning. Embed-only updates (e.g. Discord adding a
 * link preview) fire messageUpdate without a content change — skip those. When
 * the old message is partial its content is unknown, so rescan to be safe.
 */
export function editNeedsRescan(oldContent: string | null, newContent: string): boolean {
  return oldContent === null || oldContent !== newContent;
}

/**
 * Deleted content as it appears in the moderation log: spoiler-wrapped so mods
 * opt in to reading it, pipes stripped (they would break the spoiler), and
 * truncated so a wall of text can't flood the log channel.
 */
export function logSnippet(content: string): string {
  const clean = content.replaceAll('|', '').trim();
  const short = clean.length > 180 ? `${clean.slice(0, 180)}…` : clean;
  return short.length > 0 ? `||${short}||` : '';
}

export async function moderateMessage(msg: Message): Promise<void> {
  if (!msg.guild || msg.author.bot || !msg.member) return;
  const config = await getCachedGuildConfig(msg.guild.id);
  const admin = isGuildAdmin(msg.member as GuildMember, config.admin_role_id);
  if (!shouldModerate(config, admin)) return;

  const verdict = scanMessage(msg.content, {
    customWords: config.protection.custom_words,
    allowedDomains: config.protection.allowed_domains,
  });
  if (!verdict.blocked) return;

  await msg.delete().catch(() => {});
  const warn = await (msg.channel as TextChannel)
    .send(`<@${msg.author.id}> رسالتك حُذفت (${verdict.reason}). ممنوع الروابط المشبوهة/السكام.`)
    .catch(() => null);
  if (warn) setTimeout(() => void warn.delete().catch(() => {}), 5000);

  if (config.protection.log_channel_id) {
    const log = msg.guild.channels.cache.get(config.protection.log_channel_id);
    if (log?.isTextBased()) {
      const snippet = logSnippet(msg.content);
      const lines = [
        `🛡️ حذف رسالة من <@${msg.author.id}> في <#${msg.channelId}> — السبب: ${verdict.reason}`,
        ...(snippet ? [snippet] : []),
      ];
      await (log as TextChannel)
        // No pings: reposted content may contain @everyone/@user mentions.
        .send({ content: lines.join('\n'), allowedMentions: { parse: [] } })
        .catch(() => {});
    }
  }
}

export function registerTextProtection(client: Client): void {
  client.on('messageCreate', async (msg) => {
    try {
      await moderateMessage(msg);
    } catch (err) {
      console.error('[text-protection]', err);
    }
  });

  // Editing a clean message into a blocked one would otherwise bypass the
  // create-time scan entirely — rescan edits with the same rules.
  client.on('messageUpdate', async (oldMsg: Message | PartialMessage, newMsg: Message | PartialMessage) => {
    try {
      const full = newMsg.partial ? await newMsg.fetch() : newMsg;
      const oldContent = oldMsg.partial ? null : oldMsg.content;
      if (!editNeedsRescan(oldContent, full.content)) return;
      await moderateMessage(full);
    } catch (err) {
      console.error('[text-protection]', err);
    }
  });
}
