import { generateDependencyReport } from '@discordjs/voice';
import { connectDb, disconnectDb, clearBotHeartbeat } from '@gamebot/db';
import { config } from './config.js';
import { createClient } from './client.js';
import { onReady } from './events/ready.js';
import { onInteractionCreate } from './events/interactionCreate.js';
import { registerActivityTracking } from './events/activity.js';
import { registerTextProtection } from './modules/protection/text-mod.js';
import { registerWelcome } from './events/guildMemberAdd.js';
import { registerVoiceLog } from './events/voice-log.js';
import { registerWeeklySummary } from './lib/weekly-summary.js';
import { registerClientErrorLogging, registerProcessSafetyNets } from './lib/resilience.js';

async function main(): Promise<void> {
  registerProcessSafetyNets();
  // Voice deps must load native (davey) + encryption (sodium) modules. On the
  // Railway (Linux) image these can silently fail to resolve; the report tells
  // us at a glance whether the runtime actually has what a voice connect needs.
  console.log('[Voice] Dependency report:\n' + generateDependencyReport());
  await connectDb(config.MONGODB_URI);
  console.log('[DB] Connected');
  const client = createClient();
  registerClientErrorLogging(client);
  onReady(client);
  onInteractionCreate(client);
  registerActivityTracking(client);
  registerTextProtection(client);
  registerWelcome(client);
  registerVoiceLog(client);
  registerWeeklySummary(client);

  // Graceful shutdown: clear the heartbeat so the dashboard shows offline
  // immediately (instead of after the 90s staleness window), then close the
  // Discord session and the DB connection cleanly.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] ${signal}`);
    await clearBotHeartbeat().catch(() => {});
    await client.destroy().catch(() => {});
    await disconnectDb().catch(() => {});
    process.exit(0);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  await client.login(config.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
