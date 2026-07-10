import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { getGuildConfig, topMembers } from '@gamebot/db';
import type { Command } from './index.js';
import { S, t, fmt } from '../lib/strings.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export const leaderboardCommand: Command = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('يعرض المتصدرين حسب المستوى'),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfig(interaction.guildId);
    const strings = t(config.language);
    await interaction.deferReply();
    const top = await topMembers(interaction.guildId, 10);
    if (top.length === 0) {
      await interaction.editReply(strings.leaderboardEmpty);
      return;
    }
    const lines = top.map((m, i) =>
      fmt(strings.leaderboardLine, { medal: MEDALS[i] ?? `${i + 1}.`, user: m.user_id, level: m.level, xp: m.xp }),
    );
    const embed = new EmbedBuilder()
      .setTitle(strings.leaderboardTitle)
      .setDescription(lines.join('\n'))
      .setColor(0x6366f1);
    await interaction.editReply({ embeds: [embed] });
  },
};
