import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { isSpeakerAllowed, SLASH_TEXT_OPTION } from '@gamebot/shared';
import { t } from '../../lib/strings.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { getCachedCommandFlows } from '../../lib/flows-cache.js';
import { getSession } from '../voice-ai/sessions.js';
import { executeActions, type ExecContext } from './executor.js';
import { checkCooldown } from './cooldown.js';

/**
 * Executes a custom flow exposed as a per-guild slash command (dashboard →
 * commands page → "show as / command"). The web server registers the command
 * with Discord on save; this runs it when a member invokes it.
 * Returns false when the interaction doesn't belong to a flow command.
 */
export async function runFlowSlashCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guildId || !interaction.guild) return false;
  const flows = await getCachedCommandFlows(interaction.guildId);
  const flow = flows.flows.find((f) => f.enabled && f.slash_name === interaction.commandName);
  if (!flow) return false;

  const config = await getCachedGuildConfig(interaction.guildId);
  const strings = t(config.language);
  const member = interaction.member;
  const roleIds = member
    ? Array.isArray(member.roles)
      ? member.roles
      : [...member.roles.cache.keys()]
    : [];

  if (!isSpeakerAllowed(flow.conditions, interaction.user.id, roleIds)) {
    await interaction.reply({ content: strings.commandNotAllowed, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (flow.conditions.channel_ids.length > 0 && !flow.conditions.channel_ids.includes(interaction.channelId)) {
    await interaction.reply({ content: strings.commandNotAllowed, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!checkCooldown(`${interaction.guildId}:${flow.id}:${interaction.user.id}`, flow.cooldown_seconds)) {
    await interaction.reply({ content: '⏳', flags: MessageFlags.Ephemeral });
    return true;
  }

  // Actions may take longer than Discord's 3s reply window (AI, TTS fetch).
  await interaction.deferReply();
  const args = interaction.options.getString(SLASH_TEXT_OPTION) ?? '';
  const ctx: ExecContext = {
    guild: interaction.guild,
    invokerId: interaction.user.id,
    utterance: args || flow.slash_name,
    args,
    source: 'text',
    session: getSession(interaction.guildId), // slash commands may steer an active voice session
    config,
  };
  const { reply } = await executeActions(flow.actions, ctx);
  await interaction.editReply(reply ? reply.slice(0, 2000) : '✅');
  return true;
}
