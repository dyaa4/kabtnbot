import type { Client } from 'discord.js';
import { recordChatMessage } from '@gamebot/db';
import { chatLogEnabled } from '../config.js';

/**
 * Premium chat log: stores recent channel messages (7-day TTL, content capped
 * in the repo) so the dashboard can show a moderation-style message log like
 * the voice log. Recording is NOT gated on premium.active: viewing is gated in
 * the web API, and gating the recorder too would leave the log permanently
 * empty for guilds that gain access another way (e.g. super-admin bypass) —
 * premium enforcement is deferred until the payment system exists.
 * Requires ENABLE_CHAT_LOG=true (MessageContent intent).
 */
export function registerChatLog(client: Client): void {
  if (!chatLogEnabled) return;
  client.on('messageCreate', async (msg) => {
    try {
      if (!msg.guild || msg.author.bot || !msg.content) return;
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
