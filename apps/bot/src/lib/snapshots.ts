import type { Client } from 'discord.js';
import { recordMemberSnapshot } from '@gamebot/db';
import { todayKey } from '@gamebot/shared';

export async function recordSnapshots(client: Client): Promise<void> {
  const today = todayKey();
  for (const guild of client.guilds.cache.values()) {
    await recordMemberSnapshot(guild.id, guild.memberCount, today).catch((err) =>
      console.error(`[Snapshots] guild ${guild.id}:`, err),
    );
  }
}
