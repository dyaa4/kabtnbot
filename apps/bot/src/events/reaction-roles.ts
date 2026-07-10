import { MessageFlags, type ButtonInteraction, type GuildMember } from 'discord.js';
import { getCachedGuildConfig } from '../lib/config-cache.js';
import { t, fmt } from '../lib/strings.js';

/**
 * Toggles a self-assignable role from a `/roles` panel button (customId
 * `rr:<roleId>`). Adds the role if the member lacks it, removes it otherwise.
 * Failures (role hierarchy / missing Manage Roles) surface as an ephemeral note.
 */
export async function handleRoleButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;
  const roleId = interaction.customId.slice(3);
  const config = await getCachedGuildConfig(interaction.guildId);
  const strings = t(config.language);
  const role = interaction.guild.roles.cache.get(roleId) ?? (await interaction.guild.roles.fetch(roleId).catch(() => null));
  const roleName = role?.name ?? roleId;
  const member = interaction.member as GuildMember;
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: fmt(strings.roleRemoved, { role: roleName }), flags: MessageFlags.Ephemeral });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: fmt(strings.roleAdded, { role: roleName }), flags: MessageFlags.Ephemeral });
    }
  } catch {
    await interaction.reply({ content: strings.roleToggleFailed, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}
