import { createHash } from 'node:crypto';
import { REST, Routes } from 'discord.js';
import { getKv, setKv } from '@gamebot/db';
import { config } from '../config.js';
import { registerCommands } from '../commands/index.js';

export function commandsHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export type SyncResult = 'synced' | 'unchanged';

/**
 * Core sync decision: compare the command-set hash with the last deployed one
 * (per scope) and only call `put` when it changed. A failed put keeps the old
 * hash, so the next boot retries.
 */
export async function syncCommands(opts: {
  scope: string;
  body: unknown;
  put: () => Promise<void>;
}): Promise<SyncResult> {
  const hash = commandsHash(opts.body);
  const kvKey = `commands_hash:${opts.scope}`;
  if ((await getKv(kvKey)) === hash) return 'unchanged';
  await opts.put();
  await setKv(kvKey, hash);
  return 'synced';
}

/**
 * Auto-deploy slash commands on startup when the set changed, so operators no
 * longer need to remember `pnpm deploy:commands` after adding a command.
 */
export async function syncCommandsIfChanged(): Promise<SyncResult> {
  const body = [...registerCommands().values()].map((c) => c.data.toJSON());
  const scope = config.DISCORD_GUILD_ID ? `guild:${config.DISCORD_GUILD_ID}` : 'global';
  const rest = new REST().setToken(config.DISCORD_TOKEN);
  const route = config.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
    : Routes.applicationCommands(config.DISCORD_CLIENT_ID);
  return syncCommands({
    scope,
    body,
    put: async () => {
      await rest.put(route, { body });
    },
  });
}
