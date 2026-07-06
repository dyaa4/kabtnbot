import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { pingCommand } from './ping.js';
import { joinCommand, leaveCommand, speakCommand } from './voice.js';
import { askCommand, chatCommand } from './ask.js';
import { settingsCommand } from './settings.js';
import { welcomeTestCommand } from './welcome-test.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

const commandMap = new Map<string, Command>();

export function registerCommands(): Map<string, Command> {
  if (commandMap.size > 0) return commandMap;
  const all: Command[] = [pingCommand, joinCommand, leaveCommand, speakCommand, askCommand, chatCommand, settingsCommand, welcomeTestCommand];
  for (const cmd of all) commandMap.set(cmd.data.name, cmd);
  return commandMap;
}
