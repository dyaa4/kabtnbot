import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { topPlayers } from '@gamebot/db';
import type { Command } from './index.js';
import { S } from '../lib/strings.js';
import { renderLeaderboardEmbed } from '../modules/customs/embeds.js';

export const leaderboardCommand: Command = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('لوحة صدارة السيرفر'),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const players = await topPlayers(interaction.guildId, 10);
    await interaction.reply({ embeds: [renderLeaderboardEmbed(players)] });
  },
};
