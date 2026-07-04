import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { S } from '../../lib/strings.js';

export async function handleCustomResult(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: S.noActiveMatch, flags: MessageFlags.Ephemeral });
}
export async function handleCustomCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: S.noActiveMatch, flags: MessageFlags.Ephemeral });
}
