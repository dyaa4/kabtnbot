import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { textProtectionEnabled, summaryEnabled, textCommandsEnabled, chatLogEnabled } from './config.js';

export const wantsMessageContent =
  textProtectionEnabled || summaryEnabled || textCommandsEnabled || chatLogEnabled;

// Whether the CURRENT client actually holds the MessageContent intent — false
// after the content-less fallback login (index.ts). Feature reporting reads
// this so the dashboard never claims a dormant feature is recording.
let messageContentActive = false;
export function contentIntentActive(): boolean {
  return messageContentActive;
}

export function createClient(withMessageContent: boolean = wantsMessageContent): Client {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ];
  // MessageContent is privileged: requesting it without enabling it in the
  // Discord Developer Portal fails the login ("Used disallowed intents").
  // index.ts catches that and retries with withMessageContent=false so the
  // bot still boots — text features stay dormant until the intent is on.
  if (withMessageContent) intents.push(GatewayIntentBits.MessageContent);
  messageContentActive = withMessageContent;

  return new Client({
    intents,
    // Partials so messageReactionAdd still fires for messages that aren't in
    // the cache (e.g. sent before the bot restarted) — otherwise reactions on
    // older messages are silently dropped.
    partials: [Partials.Message, Partials.Reaction],
  });
}
