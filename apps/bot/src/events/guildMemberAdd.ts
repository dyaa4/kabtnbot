import type { Client, TextChannel } from 'discord.js';
import { getGuildConfigRead } from '@gamebot/db';
import { buildWelcomeMessage } from '../lib/welcome-message.js';
import { formatWelcome } from '../lib/welcome-image.js';
import { t } from '../lib/strings.js';

export function registerWelcome(client: Client): void {
  client.on('guildMemberAdd', async (member) => {
    try {
      const config = await getGuildConfigRead(member.guild.id);

      // Auto role is independent of welcome messages. Fails (logged) when the
      // bot lacks Manage Roles or its role sits below the target role.
      if (config.welcome.auto_role_id) {
        await member.roles
          .add(config.welcome.auto_role_id)
          .catch((err) => console.error('[welcome] auto-role:', err));
      }

      if (!config.welcome.enabled || !config.welcome.channel_id) return;
      const channel = member.guild.channels.cache.get(config.welcome.channel_id);
      if (!channel?.isTextBased()) return;

      const { content, files } = await buildWelcomeMessage(member, config);
      await (channel as TextChannel).send({ content, files }).catch(() => {});
    } catch (err) {
      console.error('[welcome]', err);
    }
  });

  client.on('guildMemberRemove', async (member) => {
    try {
      const config = await getGuildConfigRead(member.guild.id);
      // Farewell has its own channel; unset = the welcome channel (legacy).
      const channelId = config.welcome.farewell_channel_id ?? config.welcome.channel_id;
      if (!config.welcome.farewell_enabled || !channelId) return;
      const channel = member.guild.channels.cache.get(channelId);
      if (!channel?.isTextBased()) return;

      const strings = t(config.language);
      // Mentions don't resolve for departed users — use the plain username.
      // slice: placeholder expansion must not push past Discord's 2000-char limit.
      const content = formatWelcome(config.welcome.farewell_message || strings.defaultFarewell, {
        user: member.user?.username ?? strings.unknownMember,
        server: member.guild.name,
        count: member.guild.memberCount,
      }).slice(0, 2000);
      await (channel as TextChannel).send({ content }).catch(() => {});
    } catch (err) {
      console.error('[farewell]', err);
    }
  });
}
