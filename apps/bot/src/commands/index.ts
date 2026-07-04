import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { pingCommand } from './ping.js';
import { customCommand } from './custom.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

const commandMap = new Map<string, Command>();

export function registerCommands(): Map<string, Command> {
  if (commandMap.size > 0) return commandMap;
  const all: Command[] = [pingCommand, customCommand];
  for (const cmd of all) commandMap.set(cmd.data.name, cmd);
  return commandMap;
}
