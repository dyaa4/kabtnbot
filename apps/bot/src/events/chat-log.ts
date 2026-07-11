import type { Client } from 'discord.js';
import { recordChatMessage } from '@gamebot/db';
import { chatLogEnabled } from '../config.js';
import { getCachedGuildConfig } from '../lib/config-cache.js';

/**
 * Premium chat log: stores recent channel messages (7-day TTL, content capped
 * in the repo) so the dashboard can show a moderation-style message log like
 * the voice log. Only records for guilds with premium active — the log is a
 * gated feature, so non-premium guilds produce no stored content at all.
 * Requires ENABLE_CHAT_LOG=true (MessageContent intent).
 */
export function registerChatLog(client: Client): void {
  if (!chatLogEnabled) return;
  client.on('messageCreate', async (msg) => {
    try {
      if (!msg.guild || msg.author.bot || !msg.content) return;
      const config = await getCachedGuildConfig(msg.guild.id);
      if (!config.premium.active) return;
      await recordChatMessage({
        guildId: msg.guild.id,
        userId: msg.author.id,
        channelId: msg.channelId,
        messageId: msg.id,
        content: msg.content,
      });
    } catch (err) {
      console.error('[chat-log]', err);
    }
  });
}
