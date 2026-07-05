import type { Client } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { registerCommands } from '../commands/index.js';
import { S } from '../lib/strings.js';

export function onInteractionCreate(client: Client): void {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = registerCommands().get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
      }
    } catch (err) {
      console.error('[Interaction] Error:', err);
      if (interaction.isRepliable()) {
        const payload = { content: S.genericError, flags: MessageFlags.Ephemeral } as const;
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
    }
  });
}
