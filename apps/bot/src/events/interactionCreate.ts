import type { Client, Interaction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { registerCommands } from '../commands/index.js';
import { S } from '../lib/strings.js';

// Implemented in Task 8; imported lazily to avoid circular deps at scaffold time.
async function routeButton(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith('custom:')) {
    const { handleCustomButton } = await import('../modules/customs/lobby.js');
    await handleCustomButton(interaction);
  }
}

export function onInteractionCreate(client: Client): void {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = registerCommands().get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
        return;
      }
      await routeButton(interaction);
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
