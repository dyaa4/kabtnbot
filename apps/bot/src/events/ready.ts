import type { Client } from 'discord.js';
import { closeExpiredMatches } from '../modules/customs/result.js';
import { recordSnapshots } from '../lib/snapshots.js';

export function onReady(client: Client): void {
  client.once('clientReady', () => {
    console.log(`[Ready] Logged in as ${client.user?.tag}`);
    // Startup recovery + hourly stale-match sweep.
    void closeExpiredMatches(client).catch((err) => console.error('[Customs] sweep:', err));
    setInterval(
      () => void closeExpiredMatches(client).catch((err) => console.error('[Customs] sweep:', err)),
      60 * 60 * 1000,
    );
    // Startup snapshot + every 6h member-count sampling for the growth chart.
    void recordSnapshots(client).catch((err) => console.error('[Snapshots] sweep:', err));
    setInterval(
      () => void recordSnapshots(client).catch((err) => console.error('[Snapshots] sweep:', err)),
      6 * 60 * 60 * 1000,
    );
  });
}
