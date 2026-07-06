import { SlashCommandBuilder, MessageFlags, type GuildMember } from 'discord.js';
import { getGuildConfigRead } from '@gamebot/db';
import type { Command } from './index.js';
import { S, fmt } from '../lib/strings.js';
import { isGuildAdmin } from '../lib/permissions.js';
import { buildWelcomeMessage } from '../lib/welcome-message.js';

export const welcomeTestCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome-test')
    .setDescription('معاينة رسالة وصورة الترحيب كأنك عضو جديد (للإدارة)'),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.member) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfigRead(interaction.guildId);
    if (!isGuildAdmin(interaction.member as GuildMember, config.admin_role_id)) {
      await interaction.reply({ content: S.notAdmin, flags: MessageFlags.Ephemeral });
      return;
    }

    // Rendering fetches the banner and avatar — defer so the token doesn't expire.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { content, files } = await buildWelcomeMessage(interaction.member as GuildMember, config);

    const status = [
      config.welcome.enabled ? S.welcomeEnabledNote : S.welcomeDisabledNote,
      config.welcome.channel_id
        ? fmt(S.welcomeChannelNote, { channel: `<#${config.welcome.channel_id}>` })
        : S.welcomeNoChannelNote,
    ].join('\n');

    await interaction.editReply({ content: `${content}\n\n${status}`, files });
  },
};
