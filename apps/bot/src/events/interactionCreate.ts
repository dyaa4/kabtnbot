import type { Client, ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { isSpeakerAllowed, type SlashCommandKey } from '@gamebot/shared';
import { registerCommands } from '../commands/index.js';
import { S, t } from '../lib/strings.js';
import { getCachedGuildConfig } from '../lib/config-cache.js';
import { getCachedCommandFlows } from '../lib/flows-cache.js';
import { isInteractionMemberAdmin } from '../lib/permissions.js';

/**
 * Dashboard-configured gate for slash commands (commands page → "Discord /"):
 * each command can be disabled per guild or restricted to roles/users.
 * Returns the refusal text to send, or null when the command may run.
 * Guild admins ALWAYS bypass — otherwise disabling /settings would lock the
 * admins out of their own bot with no way back except the dashboard.
 */
async function slashRefusal(interaction: ChatInputCommandInteraction): Promise<string | null> {
  if (!interaction.guildId) return null; // DM commands guard themselves (guildOnly)
  const flows = await getCachedCommandFlows(interaction.guildId);
  const override = flows.slash_overrides[interaction.commandName as SlashCommandKey];
  if (!override) return null;

  const config = await getCachedGuildConfig(interaction.guildId);
  const strings = t(config.language);
  const member = interaction.member;
  // In a guild the member is either a full GuildMember (cached) or the raw
  // API shape (roles as a plain id array) — read roles from whichever we got.
  const roleIds = member
    ? Array.isArray(member.roles)
      ? member.roles
      : [...member.roles.cache.keys()]
    : [];
  // Admins ALWAYS bypass (either member shape) — else disabling /settings could
  // lock the admins out of their own bot with no way back.
  if (isInteractionMemberAdmin(member, roleIds, config.admin_role_id)) return null;
  if (!override.enabled) return strings.slashDisabled;
  if (!isSpeakerAllowed(override, interaction.user.id, roleIds)) return strings.commandNotAllowed;
  return null;
}

export function onInteractionCreate(client: Client): void {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = registerCommands().get(interaction.commandName);
        if (!cmd) {
          // Not one of ours → a custom flow registered as a guild slash command.
          const { runFlowSlashCommand } = await import('../modules/custom-commands/slash-runner.js');
          const handled = await runFlowSlashCommand(interaction);
          // A stale guild command (its flow was disabled/renamed/deleted before
          // Discord re-synced the command set) matches nothing — acknowledge it
          // so the user doesn't get Discord's red "application did not respond".
          if (!handled && interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            const strings = interaction.guildId
              ? t((await getCachedGuildConfig(interaction.guildId).catch(() => null))?.language ?? 'ar')
              : S;
            await interaction.reply({ content: strings.slashDisabled, flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          return;
        }
        const refusal = await slashRefusal(interaction);
        if (refusal) {
          await interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });
          return;
        }
        await cmd.execute(interaction);
      }
    } catch (err) {
      console.error('[Interaction] Error:', err);
      if (interaction.isRepliable()) {
        const strings = interaction.guildId
          ? t((await getCachedGuildConfig(interaction.guildId).catch(() => null))?.language ?? 'ar')
          : S;
        const payload = { content: strings.genericError, flags: MessageFlags.Ephemeral } as const;
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
    }
  });
}
