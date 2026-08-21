import type { ChatInputCommandInteraction } from 'discord.js';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { sendTicketPanel } from '../modules/tickets/index.js';
import { getCachedGuildConfig } from '../lib/config-cache.js';
import { t } from '../lib/strings.js';

export const ticketCommand = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Post the ticket panel embed with the open button'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Quick setup: enable tickets, set category & panel channel'),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ Server only.', ephemeral: true });
      return;
    }

    const config = await getCachedGuildConfig(interaction.guildId);
    const strings = t(config.language);

    // ── /ticket panel ──────────────────────────────────────────────────
    if (interaction.options.getSubcommand() === 'panel') {
      if (!config.tickets.enabled) {
        await interaction.reply({ content: '❌ Tickets are disabled. Enable them in the dashboard first.', ephemeral: true });
        return;
      }
      if (!config.tickets.panel_channel_id) {
        await interaction.reply({ content: '❌ No panel channel set. Configure it in Dashboard → Tickets.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const channelId = await sendTicketPanel(interaction.client, interaction.guildId);
      if (channelId) {
        await interaction.editReply(`✅ Ticket panel posted in <#${channelId}>`);
      } else {
        await interaction.editReply('❌ Failed to post the panel. Check bot permissions.');
      }
      return;
    }

    // ── /ticket setup ──────────────────────────────────────────────────
    if (interaction.options.getSubcommand() === 'setup') {
      await interaction.reply({
        content: [
          '📋 **Ticket Quick-Setup**',
          '',
          '1. Create a **category** for ticket channels (e.g. "Support")',
          '2. Create a **text channel** for the panel (e.g. #support)',
          '3. Create a **role** for support staff (e.g. "Support Team")',
          '4. Go to **Dashboard → Tickets** and configure:',
          '   - Enable tickets ✅',
          '   - Pick the category, panel channel, log channel, support role',
          '5. Come back here and run `/ticket panel`',
          '',
          'That\'s it!',
        ].join('\n'),
        ephemeral: true,
      });
    }
  },
};
