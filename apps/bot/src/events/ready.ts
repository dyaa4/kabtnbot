import type { Client } from 'discord.js';

export function onReady(client: Client): void {
  client.once('clientReady', () => {
    console.log(`[Ready] Logged in as ${client.user?.tag}`);
  });
}
