import { type Client, type GuildMember, type TextChannel } from 'discord.js';
import { scanMessage } from '@gamebot/shared';
import { getGuildConfig } from '@gamebot/db';
import { isGuildAdmin } from '../../lib/permissions.js';
import type { GuildConfig } from '@gamebot/shared';

export function shouldModerate(config: GuildConfig, isAdmin: boolean): boolean {
  return config.protection.enabled && config.protection.text_protection && !isAdmin;
}

export function registerTextProtection(client: Client): void {
  client.on('messageCreate', async (msg) => {
    try {
      if (!msg.guild || msg.author.bot || !msg.member) return;
      const config = await getGuildConfig(msg.guild.id);
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
    } catch (err) {
      console.error('[text-protection]', err);
    }
  });
}
