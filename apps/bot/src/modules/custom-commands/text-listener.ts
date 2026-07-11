import type { Client, Message } from 'discord.js';
import { matchCustomFlows, isSpeakerAllowed } from '@gamebot/shared';
import { textCommandsEnabled } from '../../config.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { getCachedCommandFlows } from '../../lib/flows-cache.js';
import { getSession } from '../voice-ai/sessions.js';
import { executeActions, type ExecContext } from './executor.js';
import { checkCooldown } from './cooldown.js';

async function handleMessage(msg: Message): Promise<void> {
  if (!msg.guild || msg.author.bot || !msg.member || !msg.content) return;

  // Command flows are premium — non-premium guilds never match text triggers.
  const config = await getCachedGuildConfig(msg.guild.id);
  if (!config.premium.active) return;

  const flows = await getCachedCommandFlows(msg.guild.id);
  // Fast skip before any matching work — most guilds define no text triggers.
  if (!flows.flows.some((f) => f.enabled && f.sources.text)) return;

  const match = matchCustomFlows(flows.flows, msg.content, 'text');
  if (!match) return;
  const { flow, args } = match;
  if (flow.conditions.channel_ids.length > 0 && !flow.conditions.channel_ids.includes(msg.channelId)) return;
  // Unauthorized text triggers are ignored SILENTLY — replying would hand
  // spammers a way to make the bot answer them.
  if (!isSpeakerAllowed(flow.conditions, msg.author.id, [...msg.member.roles.cache.keys()])) return;
  if (!checkCooldown(`${msg.guild.id}:${flow.id}:${msg.author.id}`, flow.cooldown_seconds)) return;

  const ctx: ExecContext = {
    guild: msg.guild,
    invokerId: msg.author.id,
    utterance: msg.content,
    args,
    source: 'text',
    session: getSession(msg.guild.id), // text commands may steer an active voice session
    mentionedUserIds: [...msg.mentions.users.keys()],
    config,
  };
  const { reply } = await executeActions(flow.actions, ctx);
  if (reply) {
    await msg.reply({ content: reply.slice(0, 2000), allowedMentions: { parse: [] } }).catch(() => {});
  }
}

/**
 * User-defined TEXT command triggers (flow editor). No LLM fallback here —
 * unlike voice there is no wake-word gate, so an AI call per message would be
 * a cost/abuse hazard. Requires ENABLE_TEXT_COMMANDS=true (MessageContent intent).
 */
export function registerCustomCommands(client: Client): void {
  if (!textCommandsEnabled) return;
  client.on('messageCreate', async (msg) => {
    try {
      await handleMessage(msg);
    } catch (err) {
      console.error('[custom-commands]', err);
    }
  });
}
