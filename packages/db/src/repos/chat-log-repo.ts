import { ChatMessageModel, type ChatMessageDoc } from '../models.js';

export interface ChatLogEntry {
  user_id: string;
  channel_id: string;
  message_id: string;
  content: string;
  created_at: Date;
}

// Stored content is capped — the log is for moderation review, not archival.
const MAX_CONTENT = 500;

export async function recordChatMessage(entry: {
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  content: string;
  at?: Date;
}): Promise<void> {
  const content = entry.content.slice(0, MAX_CONTENT);
  if (!content) return;
  await ChatMessageModel.create({
    guild_id: entry.guildId,
    user_id: entry.userId,
    channel_id: entry.channelId,
    message_id: entry.messageId,
    content,
    ...(entry.at ? { created_at: entry.at } : {}),
  });
}

export async function listChatMessages(guildId: string, limit = 200): Promise<ChatLogEntry[]> {
  const docs = (await ChatMessageModel.find({ guild_id: guildId })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean()) as ChatMessageDoc[];
  return docs.map((d) => ({
    user_id: d.user_id,
    channel_id: d.channel_id,
    message_id: d.message_id,
    content: d.content,
    created_at: d.created_at,
  }));
}
