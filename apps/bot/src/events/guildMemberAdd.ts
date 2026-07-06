import type { Client, TextChannel } from 'discord.js';
import { getGuildConfigRead } from '@gamebot/db';
import { buildWelcomeMessage } from '../lib/welcome-message.js';

export function registerWelcome(client: Client): void {
  client.on('guildMemberAdd', async (member) => {
    try {
      const config = await getGuildConfigRead(member.guild.id);
      if (!config.welcome.enabled || !config.welcome.channel_id) return;
      const channel = member.guild.channels.cache.get(config.welcome.channel_id);
      if (!channel?.isTextBased()) return;

      const { content, files } = await buildWelcomeMessage(member, config);
      await (channel as TextChannel).send({ content, files }).catch(() => {});
    } catch (err) {
      console.error('[welcome]', err);
    }
  });
}
