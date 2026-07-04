import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getPlayer } from '@gamebot/db';
import type { Command } from './index.js';
import { S } from '../lib/strings.js';
import { renderProfileEmbed } from '../modules/customs/embeds.js';

export const profileCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('ملف اللاعب')
    .addUserOption((o) => o.setName('user').setDescription('العضو (افتراضياً أنت)')),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const user = interaction.options.getUser('user') ?? interaction.user;
    const player = await getPlayer(interaction.guildId, user.id);
    if (!player) {
      await interaction.reply({ content: S.profileNoData, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [renderProfileEmbed(user.displayName, player)] });
  },
};
