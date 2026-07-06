import { VoiceSessionModel, type VoiceSessionDoc } from '../models.js';

export interface VoiceSession {
  user_id: string;
  channel_id: string;
  joined_at: Date;
  left_at: Date | null;
  seconds: number;
}

function toSession(doc: VoiceSessionDoc, now: Date): VoiceSession {
  const end = doc.left_at ?? now;
  return {
    user_id: doc.user_id,
    channel_id: doc.channel_id,
    joined_at: doc.joined_at,
    left_at: doc.left_at,
    seconds: Math.max(0, Math.floor((end.getTime() - doc.joined_at.getTime()) / 1000)),
  };
}

/** Opens a session; any dangling open session for the user (missed leave
 *  event, bot restart) is closed first so a user never has two open ones. */
export async function startVoiceSession(guildId: string, userId: string, channelId: string, at: Date = new Date()): Promise<void> {
  await VoiceSessionModel.updateMany(
    { guild_id: guildId, user_id: userId, left_at: null },
    { $set: { left_at: at } },
  );
  await VoiceSessionModel.create({ guild_id: guildId, user_id: userId, channel_id: channelId, joined_at: at });
}

export async function endVoiceSession(guildId: string, userId: string, at: Date = new Date()): Promise<void> {
  await VoiceSessionModel.updateMany(
    { guild_id: guildId, user_id: userId, left_at: null },
    { $set: { left_at: at } },
  );
}

/** Startup reconcile: the bot was offline, so open sessions are unreliable. */
export async function closeAllOpenVoiceSessions(at: Date = new Date()): Promise<void> {
  await VoiceSessionModel.updateMany({ left_at: null }, { $set: { left_at: at } });
}

export async function activeVoiceSessions(guildId: string, now: Date = new Date()): Promise<VoiceSession[]> {
  const docs = (await VoiceSessionModel.find({ guild_id: guildId, left_at: null })
    .sort({ joined_at: -1 })
    .lean()) as VoiceSessionDoc[];
  return docs.map((d) => toSession(d, now));
}

export async function listVoiceSessions(
  guildId: string,
  days: number,
  limit = 200,
  now: Date = new Date(),
): Promise<VoiceSession[]> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const docs = (await VoiceSessionModel.find({ guild_id: guildId, joined_at: { $gte: cutoff } })
    .sort({ joined_at: -1 })
    .limit(limit)
    .lean()) as VoiceSessionDoc[];
  return docs.map((d) => toSession(d, now));
}
