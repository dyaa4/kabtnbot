import type { Client } from 'discord.js';
import { recordGuildPresence, recordGuildLeave, isGuildBlocked } from '@gamebot/db';

/**
 * Keeps the owner-facing guild directory in sync and enforces the block flag:
 * a blocked guild is left immediately on (re)join. Syncs all current guilds on
 * startup so the admin panel reflects reality after a restart.
 */
export function registerGuildDirectory(client: Client): void {
  client.once('clientReady', () => {
    for (const guild of client.guilds.cache.values()) {
      void recordGuildPresence(guild.id, guild.name, guild.memberCount).catch((e) =>
        console.error('[directory] sync:', (e as Error)?.message ?? e),
      );
    }
  });

  client.on('guildCreate', async (guild) => {
    try {
      if (await isGuildBlocked(guild.id)) {
        console.log(`[directory] leaving blocked guild ${guild.id}`);
        await guild.leave();
        return;
      }
      await recordGuildPresence(guild.id, guild.name, guild.memberCount);
    } catch (e) {
      console.error('[directory] guildCreate:', (e as Error)?.message ?? e);
    }
  });

  client.on('guildDelete', (guild) => {
    void recordGuildLeave(guild.id).catch((e) => console.error('[directory] guildDelete:', (e as Error)?.message ?? e));
  });
}
