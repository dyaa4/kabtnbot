import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './index.js';

export const pingCommand: Command = {
  data: new SlashCommandBuilder().setName('ping').setDescription('سرعة استجابة البوت'),
  async execute(interaction) {
    await interaction.reply({ content: `🏓 ${interaction.client.ws.ping} ms`, ephemeral: true });
  },
};
