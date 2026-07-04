import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { MatchDoc } from '@gamebot/db';
import { S, fmt } from '../../lib/strings.js';

export function renderLobbyEmbed(match: MatchDoc): EmbedBuilder {
  const max = match.team_size * 2;
  const players =
    match.players.length === 0 ? S.lobbyEmpty : match.players.map((id) => `<@${id}>`).join('\n');
  return new EmbedBuilder()
    .setTitle(fmt(S.lobbyTitle, { game: match.game }))
    .setDescription(
      fmt(S.lobbyDesc, {
        size: match.team_size,
        mode: match.balance_mode === 'balanced' ? S.balanceBalanced : S.balanceRandom,
        count: match.players.length,
        max,
        players,
      }),
    )
    .setColor(0x3b82f6);
}

export function lobbyButtons(matchId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`custom:join:${matchId}`).setLabel(S.btnJoin).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`custom:leave:${matchId}`).setLabel(S.btnLeave).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`custom:start:${matchId}`).setLabel(S.btnStart).setStyle(ButtonStyle.Primary),
  );
}

export function renderTeamsEmbed(match: MatchDoc): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(fmt(S.lobbyTitle, { game: match.game }))
    .setDescription(S.matchStarted)
    .addFields(
      { name: S.teamA, value: match.team_a.map((id) => `<@${id}>`).join('\n') || '—', inline: true },
      { name: S.teamB, value: match.team_b.map((id) => `<@${id}>`).join('\n') || '—', inline: true },
    )
    .setColor(0x22c55e);
}
