import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { textProtectionEnabled, summaryEnabled, textCommandsEnabled, chatLogEnabled } from './config.js';

export function createClient(): Client {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ];
  // MessageContent is a privileged intent — requesting it unconditionally makes the bot
  // fail to boot ("Used disallowed intents") on any deploy that hasn't enabled it in the
  // Discord Developer Portal. Only request it when text protection is actually turned on
  // for this deploy (ENABLE_TEXT_PROTECTION=true) — the operator must also enable the
  // Message Content Intent in the portal in that case. See README.
  if (textProtectionEnabled || summaryEnabled || textCommandsEnabled || chatLogEnabled) {
    intents.push(GatewayIntentBits.MessageContent);
  }

  return new Client({
    intents,
    // Partials so messageReactionAdd still fires for messages that aren't in
    // the cache (e.g. sent before the bot restarted) — otherwise reactions on
    // older messages are silently dropped.
    partials: [Partials.Message, Partials.Reaction],
  });
}
