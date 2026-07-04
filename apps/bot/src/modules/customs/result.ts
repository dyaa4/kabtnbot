import type { ChatInputCommandInteraction, Client, Guild, GuildMember } from 'discord.js';
import {
  applyMatchResult, cancelMatch, completeMatch, findExpiredMatches, getActiveMatch, getGuildConfig,
  type GuildConfig, type MatchDoc,
} from '@gamebot/db';
import type { TeamKey } from '@gamebot/shared';
import { S, fmt } from '../../lib/strings.js';
import { isGuildAdmin } from '../../lib/permissions.js';

export async function disableLobbyMessage(guild: Guild, match: MatchDoc): Promise<void> {
  if (!match.lobby_message_id) return;
  const channel = guild.channels.cache.get(match.lobby_channel_id);
  if (!channel?.isTextBased()) return;
  await channel.messages.edit(match.lobby_message_id, { components: [] }).catch(() => {});
}

export async function cleanupMatchChannels(guild: Guild, match: MatchDoc): Promise<void> {
  await Promise.allSettled(
    match.temp_channel_ids.map((id) => guild.channels.cache.get(id)?.delete() ?? Promise.resolve()),
  );
  await disableLobbyMessage(guild, match);
}

async function requireManageableMatch(
  interaction: ChatInputCommandInteraction,
): Promise<{ match: MatchDoc; config: GuildConfig } | null> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.editReply({ content: S.guildOnly });
    return null;
  }
  const match = await getActiveMatch(interaction.guildId);
  if (!match) {
    await interaction.editReply({ content: S.noActiveMatch });
    return null;
  }
  const config = await getGuildConfig(interaction.guildId);
  const allowed =
    interaction.user.id === match.creator_id ||
    isGuildAdmin(interaction.member as GuildMember, config.customs.admin_role_id);
  if (!allowed) {
    await interaction.editReply({ content: S.onlyCreatorOrAdmin });
    return null;
  }
  return { match, config };
}

export async function handleCustomResult(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const result = await requireManageableMatch(interaction);
  if (!result) return;
  const { match, config } = result;
  if (match.status !== 'in_progress') {
    await interaction.editReply({ content: S.noActiveMatch });
    return;
  }
  const winner = interaction.options.getString('winner', true) as TeamKey;
  const completed = await completeMatch(interaction.guildId!, match._id.toString(), winner);
  if (!completed) {
    await interaction.editReply({ content: S.noActiveMatch });
    return;
  }
  const winners = winner === 'a' ? completed.team_a : completed.team_b;
  const losers = winner === 'a' ? completed.team_b : completed.team_a;
  await applyMatchResult(
    interaction.guildId!, winners, losers,
    config.customs.win_points, config.customs.loss_points,
  );
  await cleanupMatchChannels(interaction.guild!, completed);
  await interaction.editReply({
    content: fmt(S.resultRecorded, { team: winner === 'a' ? S.teamA : S.teamB }),
  });
}

export async function handleCustomCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const result = await requireManageableMatch(interaction);
  if (!result) return;
  const { match } = result;
  const cancelled = await cancelMatch(interaction.guildId!, match._id.toString());
  if (!cancelled) {
    await interaction.editReply({ content: S.noActiveMatch });
    return;
  }
  await cleanupMatchChannels(interaction.guild!, cancelled);
  await interaction.editReply({ content: S.matchCancelled });
}

const STALE_MS = 3 * 60 * 60 * 1000;

export async function closeExpiredMatches(client: Client): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MS);
  const expired = await findExpiredMatches(cutoff);
  for (const match of expired) {
    const cancelled = await cancelMatch(match.guild_id, match._id.toString());
    if (!cancelled) continue;
    const guild = client.guilds.cache.get(match.guild_id);
    if (guild) await cleanupMatchChannels(guild, cancelled);
    console.log(`[Customs] Auto-closed stale match ${match._id} in guild ${match.guild_id}`);
  }
}
