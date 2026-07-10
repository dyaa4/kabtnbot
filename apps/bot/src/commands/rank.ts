import { SlashCommandBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import { getMemberLevel, getMemberRank } from '@gamebot/db';
import { levelProgress } from '@gamebot/shared';
import type { Command } from './index.js';
import { S } from '../lib/strings.js';
import { renderRankCard } from '../lib/rank-card.js';

export const rankCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('يعرض مستواك ونقاط الخبرة (XP)')
    .addUserOption((o) => o.setName('user').setDescription('عضو آخر (اختياري)')),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const target = interaction.options.getUser('user') ?? interaction.user;
    await interaction.deferReply();
    const [{ xp }, rank] = await Promise.all([
      getMemberLevel(interaction.guildId, target.id),
      getMemberRank(interaction.guildId, target.id),
    ]);
    try {
      const buf = await renderRankCard({
        avatar: target.displayAvatarURL({ extension: 'png', size: 256 }),
        username: target.displayName,
        xp,
        rank,
      });
      await interaction.editReply({ files: [new AttachmentBuilder(buf, { name: 'rank.png' })] });
    } catch {
      // Canvas failed — degrade to a plain text summary rather than erroring out.
      const p = levelProgress(xp);
      await interaction.editReply(
        `${target.displayName} — LVL ${p.level} • ${p.intoLevel}/${p.neededForNext} XP${rank ? ` • #${rank}` : ''}`,
      );
    }
  },
};
