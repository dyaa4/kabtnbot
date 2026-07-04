import type { ButtonInteraction, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { MessageFlags } from 'discord.js';
import {
  addPlayerToMatch, createMatch, getActiveMatch, removePlayerFromMatch, setLobbyMessage,
  getGuildConfig,
} from '@gamebot/db';
import type { BalanceMode } from '@gamebot/shared';
import { S } from '../../lib/strings.js';
import { isGuildAdmin } from '../../lib/permissions.js';
import { renderLobbyEmbed, lobbyButtons } from './embeds.js';

export async function handleCustomCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channelId) {
    await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
    return;
  }
  const game = interaction.options.getString('game', true);
  const teamSize = interaction.options.getInteger('team_size', true);
  const balanceMode = interaction.options.getString('balance', true) as BalanceMode;

  let match;
  try {
    match = await createMatch({
      guildId: interaction.guildId,
      creatorId: interaction.user.id,
      game,
      teamSize,
      balanceMode,
      lobbyChannelId: interaction.channelId,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'ACTIVE_MATCH_EXISTS') {
      await interaction.reply({ content: S.activeMatchExists, flags: MessageFlags.Ephemeral });
      return;
    }
    throw err;
  }

  const message = await interaction.reply({
    embeds: [renderLobbyEmbed(match)],
    components: [lobbyButtons(match._id.toString())],
    fetchReply: true,
  });
  await setLobbyMessage(interaction.guildId, match._id.toString(), message.id);
}

export async function handleCustomButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const [, action, matchId] = interaction.customId.split(':');

  if (action === 'join') {
    const updated = await addPlayerToMatch(interaction.guildId, matchId, interaction.user.id);
    if (!updated) {
      await interaction.reply({ content: S.alreadyJoinedOrFull, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update({ embeds: [renderLobbyEmbed(updated)] });
    return;
  }

  if (action === 'leave') {
    const updated = await removePlayerFromMatch(interaction.guildId, matchId, interaction.user.id);
    if (!updated) {
      await interaction.reply({ content: S.notInLobby, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update({ embeds: [renderLobbyEmbed(updated)] });
    return;
  }

  if (action === 'start') {
    const match = await getActiveMatch(interaction.guildId);
    if (!match || match._id.toString() !== matchId || match.status !== 'lobby') {
      await interaction.reply({ content: S.noActiveMatch, flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfig(interaction.guildId);
    const member = interaction.member as GuildMember;
    const allowed =
      interaction.user.id === match.creator_id || isGuildAdmin(member, config.customs.admin_role_id);
    if (!allowed) {
      await interaction.reply({ content: S.onlyCreatorOrAdmin, flags: MessageFlags.Ephemeral });
      return;
    }
    if (match.players.length < 2) {
      await interaction.reply({ content: S.needTwoPlayers, flags: MessageFlags.Ephemeral });
      return;
    }
    const { startCustomMatch } = await import('./start.js');
    await startCustomMatch(interaction, match);
  }
}
