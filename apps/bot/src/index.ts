import { generateDependencyReport } from '@discordjs/voice';
import { connectDb, disconnectDb, clearBotHeartbeat } from '@gamebot/db';
import { config } from './config.js';
import { createClient, wantsMessageContent } from './client.js';
import { onReady } from './events/ready.js';
import { onInteractionCreate } from './events/interactionCreate.js';
import { registerActivityTracking } from './events/activity.js';
import { registerTextProtection } from './modules/protection/text-mod.js';
import { registerCustomCommands } from './modules/custom-commands/text-listener.js';
import { registerFlowScheduler } from './modules/custom-commands/scheduler.js';
import { registerWelcome } from './events/guildMemberAdd.js';
import { registerVoiceLog } from './events/voice-log.js';
import { registerChatLog } from './events/chat-log.js';
import { registerGuildDirectory } from './events/guild-directory.js';
import { registerWeeklySummary } from './lib/weekly-summary.js';
import { registerTickets } from './modules/tickets/index.js';
import { registerClientErrorLogging, registerProcessSafetyNets } from './lib/resilience.js';
import { startHealthServer } from './lib/health.js';
import { registerConnectionWatchdog } from './lib/watchdog.js';

async function main(): Promise<void> {
  console.log('[Boot] Kabtn bot starting…');
  registerProcessSafetyNets();
  // Voice deps must load native (davey) + encryption (sodium) modules. On the
  // Railway (Linux) image these can silently fail to resolve; the report tells
  // us at a glance whether the runtime actually has what a voice connect needs.
  console.log('[Voice] Dependency report:\n' + generateDependencyReport());
  await connectDb(config.MONGODB_URI);
  console.log('[DB] Connected');

  const buildClient = (withMessageContent: boolean) => {
    const client = createClient(withMessageContent);
    registerClientErrorLogging(client);
    onReady(client);
    onInteractionCreate(client);
    registerActivityTracking(client);
    registerTextProtection(client);
    registerCustomCommands(client);
    registerFlowScheduler(client);
    registerWelcome(client);
    registerVoiceLog(client);
    registerChatLog(client);
    registerGuildDirectory(client);
    registerWeeklySummary(client);
    registerTickets(client);
    return client;
  };
  let client = buildClient(wantsMessageContent);

  // Observability + self-healing: a health endpoint the platform can poll
  // (200 only when the gateway is live) plus a watchdog that exits after a
  // prolonged disconnect so the platform restarts a fresh process. Both read
  // the CURRENT client via a getter — `client` is rebuilt on the content-intent
  // fallback below, so a captured reference would go stale.
  startHealthServer(() => client.isReady(), Number(process.env.PORT) || 8080);
  registerConnectionWatchdog(() => client.isReady());

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

  try {
    await client.login(config.DISCORD_TOKEN);
  } catch (err) {
    // Text features are on by default, but MessageContent is a privileged
    // intent: without it in the Discord Developer Portal the login is
    // rejected. Boot WITHOUT the intent instead of crash-looping — voice and
    // everything else keeps working, and the dashboard shows what's dormant.
    if (wantsMessageContent && String(err).toLowerCase().includes('disallowed intents')) {
      console.error(
        '[Login] Message Content Intent is NOT enabled in the Discord Developer Portal (Bot page). ' +
          'Booting without it — chat log, text triggers, text protection and /summarize stay OFF ' +
          'until you enable the intent and redeploy.',
      );
      await client.destroy().catch(() => {});
      client = buildClient(false);
      await client.login(config.DISCORD_TOKEN);
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
