import type { Client, TextChannel, CategoryChannel } from 'discord.js';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, PermissionFlagsBits, MessageFlags,
} from 'discord.js';
import { createTicket, closeTicket, assignTicket, getTicketByChannel, getOpenTicketByUser, countOpenTickets } from '@gamebot/db';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { isGuildPremiumCached } from '../../lib/premium-cache.js';
import { t, fmt } from '../../lib/strings.js';

const TICKET_PREFIX = 'ticket-';

function buildPanelEmbed(guildName: string, welcomeMsg: string, guildIcon: string | null): EmbedBuilder {
  const desc = welcomeMsg || [
    `Need help? We're here for you!`,
    '',
    'Click the button below to open a **private support ticket**.',
    'Our team will assist you as soon as possible.',
  ].join('\n');

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: guildName, iconURL: guildIcon ?? undefined })
    .setTitle('🎫  Support Center')
    .setDescription(desc)
    .addFields(
      { name: '📬  How it works', value: '1️⃣  Click the button below\n2️⃣  Describe your issue\n3️⃣  Wait for our team to respond', inline: true },
      { name: '⏱  Response time', value: 'We typically respond within a few hours.', inline: true },
    )
    .setFooter({ text: `${guildName} • Support Team` })
    .setTimestamp()
    .setThumbnail(guildIcon);
}

function buildTicketButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_create')
      .setLabel('Open a Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Success),
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

export async function sendTicketPanel(client: Client, guildId: string): Promise<string | null> {
  const config = await getCachedGuildConfig(guildId);
  if (!config.tickets.panel_channel_id) return null;
  const channel = client.channels.cache.get(config.tickets.panel_channel_id);
  if (!channel?.isTextBased()) return null;
  const guild = client.guilds.cache.get(guildId);
  const icon = guild?.iconURL({ size: 256 }) ?? null;
  const embed = buildPanelEmbed(guild?.name ?? '', config.tickets.welcome_message, icon);
  await (channel as TextChannel).send({ embeds: [embed], components: [buildTicketButtons()] });
  return config.tickets.panel_channel_id;
}

export function registerTickets(client: Client): void {
  // Auto-close when a ticket channel is deleted manually.
  client.on('channelDelete', async (channel) => {
    if (!channel.isTextBased() || !('guildId' in channel) || !channel.guildId) return;
    try {
      const ticket = await getTicketByChannel(channel.id);
      if (ticket && ticket.status === 'open') {
        await closeTicket(channel.id);
        console.log(`[Tickets] Auto-closed ticket ${ticket._id} (channel deleted)`);
      }
    } catch (err) {
      console.error('[Tickets] channelDelete error:', err);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.guildId) return;

    const { customId } = interaction;

    // Tickets are premium-only.
    if (!await isGuildPremiumCached(interaction.guildId)) {
      await interaction.reply({ content: '❌ Tickets require a premium server.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }

    // ── Create Ticket ──────────────────────────────────────────────────
    if (customId === 'ticket_create') {
      try {
        const config = await getCachedGuildConfig(interaction.guildId);
        if (!config.tickets.enabled) {
          await interaction.reply({ content: '❌ Tickets are disabled.', flags: MessageFlags.Ephemeral }).catch(() => {});
          return;
        }

        const strings = t(config.language);
        const userId = interaction.user.id;

        const existing = await getOpenTicketByUser(interaction.guildId, userId);
        if (existing) {
          await interaction.reply({
            content: strings.ticketAlreadyOpen,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

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

        const count = await countOpenTickets(interaction.guildId);
        const ticketNum = count + 1;
        const channelName = `${TICKET_PREFIX}${ticketNum}-${interaction.user.username}`.toLowerCase().slice(0, 100);

        const overwrites = [
          {
            id: interaction.guildId,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ManageMessages,
            ],
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

        await createTicket(interaction.guildId, userId, ticketChannel.id, '');

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
      } catch (err) {
        console.error('[Tickets] create error:', err);
        const reply = { content: '❌ An error occurred while creating the ticket.', flags: MessageFlags.Ephemeral } as const;
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: '❌ An error occurred while creating the ticket.' }).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
      return;
    }

    // ── Close Ticket ───────────────────────────────────────────────────
    if (customId === 'ticket_close') {
      try {
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

        setTimeout(() => {
          interaction.channel?.delete().catch(() => {});
        }, 5_000);
      } catch (err) {
        console.error('[Tickets] close error:', err);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: '❌ An error occurred while closing the ticket.' }).catch(() => {});
        } else {
          await interaction.reply({ content: '❌ An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }
      return;
    }

    // ── Claim Ticket ───────────────────────────────────────────────────
    if (customId === 'ticket_claim') {
      try {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket || ticket.status !== 'open') return;

        const config = await getCachedGuildConfig(interaction.guildId);
        const strings = t(config.language);

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
      } catch (err) {
        console.error('[Tickets] claim error:', err);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: '❌ An error occurred.' }).catch(() => {});
        } else {
          await interaction.reply({ content: '❌ An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }
    }
  });
}
