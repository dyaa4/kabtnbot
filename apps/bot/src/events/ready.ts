import type { Client } from 'discord.js';
import { recordBotHeartbeat } from '@gamebot/db';
import { recordSnapshots } from '../lib/snapshots.js';
import { syncCommandsIfChanged } from '../lib/command-sync.js';
import { chatLogEnabled, textCommandsEnabled, textProtectionEnabled, summaryEnabled } from '../config.js';

// Reported with every heartbeat so the dashboard can explain WHY a feature
// shows no data (e.g. the chat log without ENABLE_CHAT_LOG on this service).
const FEATURES = {
  chat_log: chatLogEnabled,
  text_commands: textCommandsEnabled,
  text_protection: textProtectionEnabled,
  summary: summaryEnabled,
};

export function onReady(client: Client): void {
  client.once('clientReady', () => {
    console.log(`[Ready] Logged in as ${client.user?.tag}`);
    console.log(
      `[Features] chat_log=${FEATURES.chat_log} text_commands=${FEATURES.text_commands} ` +
        `text_protection=${FEATURES.text_protection} summary=${FEATURES.summary}`,
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
      void recordBotHeartbeat(client.guilds.cache.size, FEATURES).catch((err) => console.error('[Heartbeat]', err));
    beat();
    setInterval(beat, 30_000);
  });
}
