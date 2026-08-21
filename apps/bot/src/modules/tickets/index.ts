import type { Client, TextChannel, CategoryChannel } from 'discord.js';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, PermissionFlagsBits, MessageFlags,
} from 'discord.js';
import { createTicket, closeTicket, assignTicket, getTicketByChannel, getOpenTicketByUser, countOpenTickets } from '@gamebot/db';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { t, fmt } from '../../lib/strings.js';

const TICKET_PREFIX = 'ticket-';

/**
 * Build the panel embed + button that gets posted in the configured channel.
 * Users click the button to open a new ticket.
 */
function buildPanelEmbed(guildName: string, welcomeMsg: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🎫 Ticket System')
    .setDescription(welcomeMsg || `Click the button below to open a ticket in **${guildName}**.`)
    .setColor(0x5865f2);
}

function buildTicketButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_create')
      .setLabel('Open Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary),
  );
}

function buildTicketControlButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Claim')
      .setEmoji('👋')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Called from the /ticket panel slash command or manually to post the panel
 * embed into the configured channel.
 */
export async function sendTicketPanel(client: Client, guildId: string): Promise<string | null> {
  const config = await getCachedGuildConfig(guildId);
  if (!config.tickets.panel_channel_id) return null;
  const channel = client.channels.cache.get(config.tickets.panel_channel_id);
  if (!channel?.isTextBased()) return null;
  const guild = client.guilds.cache.get(guildId);
  const embed = buildPanelEmbed(guild?.name ?? '', config.tickets.welcome_message);
  await (channel as TextChannel).send({ embeds: [embed], components: [buildTicketButtons()] }).catch(() => {});
  return config.tickets.panel_channel_id;
}

/**
 * Register all ticket-related interaction handlers.
 * Call once from the bot's main entry point.
 */
export function registerTickets(client: Client): void {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.guildId) return;

    const { customId } = interaction;

    // ── Create Ticket ──────────────────────────────────────────────────
    if (customId === 'ticket_create') {
      const config = await getCachedGuildConfig(interaction.guildId);
      if (!config.tickets.enabled) return;

      const strings = t(config.language);
      const userId = interaction.user.id;

      // Check if user already has an open ticket.
      const existing = await getOpenTicketByUser(interaction.guildId, userId);
      if (existing) {
        await interaction.reply({
          content: strings.ticketAlreadyOpen,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Defer reply — channel creation may take a moment.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!config.tickets.category_id) {
        await interaction.editReply(strings.ticketNoCategory);
        return;
      }

      const category = interaction.guild?.channels.cache.get(config.tickets.category_id);
      if (!category || category.type !== ChannelType.GuildCategory) {
        await interaction.editReply(strings.ticketNoCategory);
        return;
      }

      // Determine ticket number.
      const count = await countOpenTickets(interaction.guildId);
      const ticketNum = count + 1;
      const channelName = `${TICKET_PREFIX}${ticketNum}-${interaction.user.username}`.toLowerCase().slice(0, 100);

      // Build permission overwrites: user + support role + @everyone deny view.
      const overwrites = [
        {
          id: interaction.guildId,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
      ];

      // Add support role if configured.
      if (config.tickets.support_role_id) {
        overwrites.push({
          id: config.tickets.support_role_id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageMessages,
          ],
        });
      }

      const ticketChannel = await interaction.guild?.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: (category as CategoryChannel).id,
        permissionOverwrites: overwrites,
        topic: `Ticket by ${interaction.user.tag} (${userId})`,
      });

      if (!ticketChannel) {
        await interaction.editReply(strings.ticketCreateFailed);
        return;
      }

      // Save to DB.
      await createTicket(interaction.guildId, userId, ticketChannel.id, '');

      // Send welcome message + control buttons inside the ticket.
      const welcomeMsg = config.tickets.welcome_message || strings.ticketWelcomeDefault;
      const embed = new EmbedBuilder()
        .setDescription(fmt(welcomeMsg, { user: interaction.user.displayName, mention: `<@${userId}>` }))
        .setColor(0x5865f2)
        .setTimestamp();

      await (ticketChannel as TextChannel).send({
        embeds: [embed],
        components: [buildTicketControlButtons()],
        content: `<@${userId}>`,
      });

      await interaction.editReply({
        content: strings.ticketCreated.replace('{channel}', `<#${ticketChannel.id}>`),
      });
      return;
    }

    // ── Close Ticket ───────────────────────────────────────────────────
    if (customId === 'ticket_close') {
      const ticket = await getTicketByChannel(interaction.channelId);
      if (!ticket || ticket.status !== 'open') return;

      const config = await getCachedGuildConfig(interaction.guildId);
      const strings = t(config.language);

      await interaction.deferReply();

      const closed = await closeTicket(interaction.channelId);
      if (!closed) {
        await interaction.editReply(strings.ticketCloseFailed);
        return;
      }

      const closeMsg = config.tickets.close_message || strings.ticketClosedDefault;
      const embed = new EmbedBuilder()
        .setDescription(closeMsg)
        .setColor(0xed4245)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Log to log channel if configured.
      if (config.tickets.log_channel_id) {
        const logChannel = interaction.guild?.channels.cache.get(config.tickets.log_channel_id);
        if (logChannel?.isTextBased()) {
          const logEmbed = new EmbedBuilder()
            .setTitle(strings.ticketLogClosed)
            .addFields(
              { name: 'ID', value: ticket._id.toString(), inline: true },
              { name: 'User', value: `<@${ticket.user_id}>`, inline: true },
              { name: 'Channel', value: `<#${ticket.channel_id}>`, inline: true },
            )
            .setColor(0xed4245)
            .setTimestamp();
          await (logChannel as TextChannel).send({ embeds: [logEmbed] }).catch(() => {});
        }
      }

      // Delete the channel after 5 seconds.
      setTimeout(() => {
        interaction.channel?.delete().catch(() => {});
      }, 5_000);
      return;
    }

    // ── Claim Ticket ───────────────────────────────────────────────────
    if (customId === 'ticket_claim') {
      const ticket = await getTicketByChannel(interaction.channelId);
      if (!ticket || ticket.status !== 'open') return;

      const config = await getCachedGuildConfig(interaction.guildId);
      const strings = t(config.language);

      // Only support role members can claim.
      if (config.tickets.support_role_id && interaction.member) {
        const memberRoles = Array.isArray(interaction.member.roles)
          ? interaction.member.roles
          : [...interaction.member.roles.cache.keys()];
        if (!memberRoles.includes(config.tickets.support_role_id)) {
          await interaction.reply({ content: strings.ticketClaimDenied, flags: MessageFlags.Ephemeral });
          return;
        }
      }

      await assignTicket(interaction.channelId, interaction.user.id);

      const embed = new EmbedBuilder()
        .setDescription(strings.ticketClaimed.replace('{user}', interaction.user.displayName))
        .setColor(0x57f287)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  });
}
