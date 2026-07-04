import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { registerCommands } from './commands/index.js';

const body = [...registerCommands().values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(config.DISCORD_TOKEN);

const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

const data = (await rest.put(route, { body })) as unknown[];
console.log(`Registered ${data.length} commands ${config.DISCORD_GUILD_ID ? '(guild)' : '(global)'}`);
