import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { MatchDoc, PlayerDoc } from '@gamebot/db';
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

const MEDALS = ['🥇', '🥈', '🥉'];

export function renderLeaderboardEmbed(players: PlayerDoc[]): EmbedBuilder {
  const description =
    players.length === 0
      ? S.leaderboardEmpty
      : players
          .map((p, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${p.user_id}> — **${p.points}** نقطة (${p.wins}ف/${p.losses}خ)`)
          .join('\n');
  return new EmbedBuilder().setTitle(S.leaderboardTitle).setDescription(description).setColor(0xf59e0b);
}

export function renderProfileEmbed(displayName: string, player: PlayerDoc): EmbedBuilder {
  const total = player.wins + player.losses;
  const winRate = total === 0 ? 0 : Math.round((player.wins / total) * 100);
  return new EmbedBuilder()
    .setTitle(fmt(S.profileTitle, { name: displayName }))
    .addFields(
      { name: 'النقاط', value: String(player.points), inline: true },
      { name: 'فوز/خسارة', value: `${player.wins}/${player.losses}`, inline: true },
      { name: 'نسبة الفوز', value: `${winRate}%`, inline: true },
    )
    .setColor(0x8b5cf6);
}
