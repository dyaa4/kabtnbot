import type { ButtonInteraction } from 'discord.js';
import type { MatchDoc } from '@gamebot/db';

export async function startCustomMatch(interaction: ButtonInteraction, match: MatchDoc): Promise<void> {
  // Implemented in Task 9.
  await interaction.deferUpdate();
  void match;
}
