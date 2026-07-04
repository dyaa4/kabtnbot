import type { Client } from 'discord.js';
import { closeExpiredMatches } from '../modules/customs/result.js';

export function onReady(client: Client): void {
  client.once('clientReady', () => {
    console.log(`[Ready] Logged in as ${client.user?.tag}`);
    // Startup recovery + hourly stale-match sweep.
    void closeExpiredMatches(client).catch((err) => console.error('[Customs] sweep:', err));
    setInterval(
      () => void closeExpiredMatches(client).catch((err) => console.error('[Customs] sweep:', err)),
      60 * 60 * 1000,
    );
  });
}
