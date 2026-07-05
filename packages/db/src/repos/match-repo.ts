import type { BalanceMode, TeamKey } from '@gamebot/shared';
import { MatchModel, type MatchDoc } from '../models.js';

const ACTIVE: MatchDoc['status'][] = ['lobby', 'in_progress'];

export async function createMatch(input: {
  guildId: string;
  creatorId: string;
  game: string;
  teamSize: number;
  balanceMode: BalanceMode;
  lobbyChannelId: string;
}): Promise<MatchDoc> {
  const existing = await MatchModel.findOne({ guild_id: input.guildId, status: { $in: ACTIVE } }).lean();
  if (existing) throw new Error('ACTIVE_MATCH_EXISTS');
  try {
    const doc = await MatchModel.create({
      guild_id: input.guildId,
      creator_id: input.creatorId,
      game: input.game,
      team_size: input.teamSize,
      balance_mode: input.balanceMode,
      lobby_channel_id: input.lobbyChannelId,
    });
    return doc.toObject();
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      throw new Error('ACTIVE_MATCH_EXISTS');
    }
    throw err;
  }
}

export async function getActiveMatch(guildId: string): Promise<MatchDoc | null> {
  return MatchModel.findOne({ guild_id: guildId, status: { $in: ACTIVE } }).lean();
}

export async function setLobbyMessage(guildId: string, matchId: string, messageId: string): Promise<void> {
  await MatchModel.updateOne({ _id: matchId, guild_id: guildId, status: 'lobby' }, { $set: { lobby_message_id: messageId } });
}

export async function addPlayerToMatch(guildId: string, matchId: string, userId: string): Promise<MatchDoc | null> {
  return MatchModel.findOneAndUpdate(
    {
      _id: matchId,
      guild_id: guildId,
      status: 'lobby',
      players: { $ne: userId },
      $expr: { $lt: [{ $size: '$players' }, { $multiply: ['$team_size', 2] }] },
    },
    { $push: { players: userId } },
    { new: true },
  ).lean();
}

export async function removePlayerFromMatch(guildId: string, matchId: string, userId: string): Promise<MatchDoc | null> {
  return MatchModel.findOneAndUpdate(
    { _id: matchId, guild_id: guildId, status: 'lobby' },
    { $pull: { players: userId } },
    { new: true },
  ).lean();
}

export async function setMatchStarted(
  guildId: string,
  matchId: string,
  teamA: string[],
  teamB: string[],
  tempChannelIds: string[],
): Promise<MatchDoc | null> {
  return MatchModel.findOneAndUpdate(
    { _id: matchId, guild_id: guildId, status: 'lobby' },
    {
      $set: {
        status: 'in_progress',
        team_a: teamA,
        team_b: teamB,
        temp_channel_ids: tempChannelIds,
        started_at: new Date(),
      },
    },
    { new: true },
  ).lean();
}

export async function completeMatch(guildId: string, matchId: string, winner: TeamKey): Promise<MatchDoc | null> {
  return MatchModel.findOneAndUpdate(
    { _id: matchId, guild_id: guildId, status: 'in_progress' },
    { $set: { status: 'completed', winner, completed_at: new Date() } },
    { new: true },
  ).lean();
}

export async function cancelMatch(guildId: string, matchId: string): Promise<MatchDoc | null> {
  return MatchModel.findOneAndUpdate(
    { _id: matchId, guild_id: guildId, status: { $in: ACTIVE } },
    { $set: { status: 'cancelled', completed_at: new Date() } },
    { new: true },
  ).lean();
}

/** Cross-guild by design: only the cleanup job may call this. */
export async function findExpiredMatches(cutoff: Date): Promise<MatchDoc[]> {
  return MatchModel.find({ status: { $in: ACTIVE }, created_at: { $lt: cutoff } }).lean();
}

export async function recentMatches(guildId: string, limit = 10): Promise<MatchDoc[]> {
  return MatchModel.find({ guild_id: guildId, status: { $in: ['completed', 'cancelled'] } })
    .sort({ completed_at: -1 })
    .limit(limit)
    .lean();
}
