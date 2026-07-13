import type { Client } from 'discord.js';
import { recordBotHeartbeat } from '@gamebot/db';
import { recordSnapshots } from '../lib/snapshots.js';
import { syncCommandsIfChanged } from '../lib/command-sync.js';
import { chatLogEnabled, textCommandsEnabled, textProtectionEnabled, summaryEnabled } from '../config.js';
import { contentIntentActive } from '../client.js';

// Reported with every heartbeat so the dashboard can explain WHY a feature
// shows no data. A text feature only counts as active when the client also
// HOLDS the MessageContent intent — after the content-less fallback login the
// env flags alone would claim features that cannot receive any content.
const features = () => ({
  chat_log: chatLogEnabled && contentIntentActive(),
  text_commands: textCommandsEnabled && contentIntentActive(),
  text_protection: textProtectionEnabled && contentIntentActive(),
  summary: summaryEnabled && contentIntentActive(),
});

export function onReady(client: Client): void {
  client.once('clientReady', () => {
    console.log(`[Ready] Logged in as ${client.user?.tag}`);
    const f = features();
    console.log(
      `[Features] chat_log=${f.chat_log} text_commands=${f.text_commands} ` +
        `text_protection=${f.text_protection} summary=${f.summary}`,
    );
    // Keep Discord's registered slash commands in step with the code.
    void syncCommandsIfChanged()
      .then((result) => {
        if (result === 'synced') console.log('[Commands] deployed updated command set');
      })
      .catch((err) => console.error('[Commands] sync:', err));
    // Startup snapshot + every 6h member-count sampling for the growth chart.
    void recordSnapshots(client).catch((err) => console.error('[Snapshots] sweep:', err));
    setInterval(
      () => void recordSnapshots(client).catch((err) => console.error('[Snapshots] sweep:', err)),
      6 * 60 * 60 * 1000,
    );
    // Liveness heartbeat for the dashboard status badge (offline after 90s without one).
    const beat = () =>
      void recordBotHeartbeat(client.guilds.cache.size, features()).catch((err) => console.error('[Heartbeat]', err));
    beat();
    setInterval(beat, 30_000);
  });
}
