import { ChannelType, type ButtonInteraction, type EmbedBuilder, type Guild } from 'discord.js';
import { getPointsMap, setMatchStarted, type MatchDoc } from '@gamebot/db';
import { splitTeams } from '@gamebot/shared';
import { S } from '../../lib/strings.js';
import { renderTeamsEmbed } from './embeds.js';

/**
 * Core start logic, shared by the lobby button and the voice command:
 * balance teams by stored points, create two temp voice channels, move
 * whoever is currently in voice, persist the started match.
 */
export async function startMatchCore(
  guild: Guild,
  match: MatchDoc,
): Promise<{ started: MatchDoc; embed: EmbedBuilder }> {
  const pointsMap = await getPointsMap(match.guild_id, match.players);
  const ranked = match.players.map((userId) => ({ userId, points: pointsMap.get(userId) ?? 0 }));
  const { teamA, teamB } = splitTeams(ranked, match.balance_mode);

  const lobbyChannel = guild.channels.cache.get(match.lobby_channel_id);
  const parent = lobbyChannel && 'parentId' in lobbyChannel ? lobbyChannel.parentId : null;

  const [vcA, vcB] = await Promise.all([
    guild.channels.create({ name: S.teamA, type: ChannelType.GuildVoice, parent }),
    guild.channels.create({ name: S.teamB, type: ChannelType.GuildVoice, parent }),
  ]);

  const started = await setMatchStarted(match.guild_id, match._id.toString(), teamA, teamB, [vcA.id, vcB.id]);
  if (!started) {
    await Promise.allSettled([vcA.delete(), vcB.delete()]);
    throw new Error('MATCH_NOT_IN_LOBBY');
  }

  // Move members who are currently in any voice channel; ignore failures
  // (offline members or missing permissions must not abort the match).
  const moves: Promise<unknown>[] = [];
  for (const [team, channel] of [
    [teamA, vcA],
    [teamB, vcB],
  ] as const) {
    for (const userId of team) {
      const member = guild.members.cache.get(userId);
      if (member?.voice.channelId) moves.push(member.voice.setChannel(channel.id).catch(() => {}));
    }
  }
  await Promise.allSettled(moves);

  return { started, embed: renderTeamsEmbed(started) };
}

export async function startCustomMatch(interaction: ButtonInteraction, match: MatchDoc): Promise<void> {
  await interaction.deferUpdate();
  const { embed } = await startMatchCore(interaction.guild!, match);
  await interaction.editReply({ embeds: [embed], components: [] });
}
