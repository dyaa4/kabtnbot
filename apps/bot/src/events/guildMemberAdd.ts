import { AttachmentBuilder, type Client, type TextChannel } from 'discord.js';
import { getGuildAsset, getGuildConfig } from '@gamebot/db';
import { formatWelcome, renderWelcomeImage } from '../lib/welcome-image.js';

export function registerWelcome(client: Client): void {
  client.on('guildMemberAdd', async (member) => {
    try {
      const config = await getGuildConfig(member.guild.id);
      if (!config.welcome.enabled || !config.welcome.channel_id) return;
      const channel = member.guild.channels.cache.get(config.welcome.channel_id);
      if (!channel?.isTextBased()) return;

      const content = formatWelcome(config.welcome.message, {
        user: `<@${member.id}>`,
        server: member.guild.name,
        count: member.guild.memberCount,
      });

      const files: AttachmentBuilder[] = [];
      // Uploaded banner (dashboard) wins; banner_url is the legacy fallback.
      const asset = await getGuildAsset(member.guild.id, 'welcome_banner').catch(() => null);
      const banner = asset?.data ?? config.welcome.banner_url;
      if (banner) {
        const buf = await renderWelcomeImage({
          banner,
          avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }),
          name: config.welcome.show_name ? member.displayName : null,
          x: config.welcome.avatar_x,
          y: config.welcome.avatar_y,
          size: config.welcome.avatar_size,
        }).catch(() => null);
        if (buf) files.push(new AttachmentBuilder(buf, { name: 'welcome.png' }));
      }
      await (channel as TextChannel).send({ content, files }).catch(() => {});
    } catch (err) {
      console.error('[welcome]', err);
    }
  });
}
