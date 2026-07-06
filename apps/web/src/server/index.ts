import { connectDb } from '@gamebot/db';
import { config } from './config.js';
import { buildApp } from './app.js';
import { createDiscordRest } from './discord-rest.js';
import { startStatusAlerts } from './status-alert.js';

async function main(): Promise<void> {
  await connectDb(config.MONGODB_URI);
  console.log('[Web][DB] Connected');
  if (config.ALERT_WEBHOOK_URL) startStatusAlerts(config.ALERT_WEBHOOK_URL);
  const app = buildApp({ rest: createDiscordRest() });
  // Railway (and most PaaS) inject a dynamic PORT the public domain routes to;
  // fall back to WEB_PORT for local runs.
  const port = Number(process.env.PORT) || config.WEB_PORT;
  app.listen(port, () => {
    console.log(`[Web] Listening on ${config.WEB_BASE_URL} (port ${port})`);
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
