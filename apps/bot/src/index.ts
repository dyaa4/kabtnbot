import { connectDb } from '@gamebot/db';
import { config } from './config.js';
import { createClient } from './client.js';
import { onReady } from './events/ready.js';
import { onInteractionCreate } from './events/interactionCreate.js';

async function main(): Promise<void> {
  await connectDb(config.MONGODB_URI);
  console.log('[DB] Connected');
  const client = createClient();
  onReady(client);
  onInteractionCreate(client);
  await client.login(config.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
