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
      await (log as TextChannel)
        .send(`🛡️ حذف رسالة من <@${msg.author.id}> — السبب: ${verdict.reason}`)
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
