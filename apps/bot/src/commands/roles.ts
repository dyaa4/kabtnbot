import {
  SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  type GuildMember, type TextChannel,
} from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import type { Command } from './index.js';
import { S, t } from '../lib/strings.js';
import { isGuildAdmin } from '../lib/permissions.js';

// Discord allows at most 5 buttons per action row and 5 rows per message.
function buildRows(buttons: { label: string; emoji: string | null; role_id: string }[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const b of buttons.slice(i, i + 5)) {
      const btn = new ButtonBuilder().setCustomId(`rr:${b.role_id}`).setLabel(b.label).setStyle(ButtonStyle.Secondary);
      // A bad/removed custom emoji must not sink the whole panel.
      if (b.emoji) { try { btn.setEmoji(b.emoji); } catch { /* ignore invalid emoji */ } }
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

export const rolesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('ينشر لوحة أزرار لاختيار الرتب (للمشرفين)'),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfig(interaction.guildId);
    const strings = t(config.language);
    if (!isGuildAdmin(interaction.member as GuildMember, config.admin_role_id)) {
      await interaction.reply({ content: strings.notAdmin, flags: MessageFlags.Ephemeral });
      return;
    }
    const rr = config.reaction_roles;
    if (!rr.enabled || rr.buttons.length === 0) {
      await interaction.reply({ content: strings.rolesNotConfigured, flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.channel as TextChannel;
    await channel.send({ content: rr.title || undefined, components: buildRows(rr.buttons) }).catch(() => {});
    await interaction.reply({ content: strings.rolesPanelPosted, flags: MessageFlags.Ephemeral });
  },
};
