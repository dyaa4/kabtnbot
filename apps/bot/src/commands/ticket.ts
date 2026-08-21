import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { sendTicketPanel } from '../modules/tickets/index.js';
import { getCachedGuildConfig } from '../lib/config-cache.js';
import { getTicketByChannel, closeTicket, listTickets } from '@gamebot/db';
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
        .setName('close')
        .setDescription('Close a ticket (use in the ticket channel or specify an ID)')
        .addStringOption((opt) =>
          opt.setName('id').setDescription('Ticket ID to close (optional, closes current channel if omitted)').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Quick setup guide'),
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

    // ── /ticket close [id] ─────────────────────────────────────────────
    if (interaction.options.getSubcommand() === 'close') {
      const ticketId = interaction.options.getString('id');

      // If no ID given, close the ticket in the current channel.
      if (!ticketId) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) {
          await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
          return;
        }
        if (ticket.status !== 'open') {
          await interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
          return;
        }

        await interaction.deferReply();

        await closeTicket(interaction.channelId);

        const closeMsg = config.tickets.close_message || strings.ticketClosedDefault;
        await interaction.editReply({ content: `🔒 ${closeMsg}` });

        // Delete the channel after 5 seconds.
        setTimeout(() => {
          interaction.channel?.delete().catch(() => {});
        }, 5_000);
        return;
      }

      // Close by ticket ID — find the channel and delete it.
      const tickets = await listTickets(interaction.guildId, 100);
      const ticket = tickets.find((t) => t._id.toString() === ticketId);
      if (!ticket) {
        await interaction.reply({ content: `❌ Ticket \`${ticketId}\` not found.`, ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      if (ticket.status !== 'open') {
        await interaction.editReply('❌ This ticket is already closed.');
        return;
      }

      await closeTicket(ticket.channel_id);

      const ch = interaction.guild?.channels.cache.get(ticket.channel_id);
      if (ch) {
        await ch.delete().catch(() => {});
      }

      await interaction.editReply(`🔒 Ticket \`${ticketId}\` closed.`);
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
          'Commands: `/ticket close` (in ticket channel) or `/ticket close id:xxx` (by ID)',
        ].join('\n'),
        ephemeral: true,
      });
    }
  },
};
