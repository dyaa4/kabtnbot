import type { Client } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { registerCommands } from '../commands/index.js';
import { S, t } from '../lib/strings.js';
import { getCachedGuildConfig } from '../lib/config-cache.js';

export function onInteractionCreate(client: Client): void {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = registerCommands().get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
      } else if (interaction.isButton() && interaction.customId.startsWith('rr:')) {
        const { handleRoleButton } = await import('./reaction-roles.js');
        await handleRoleButton(interaction);
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
