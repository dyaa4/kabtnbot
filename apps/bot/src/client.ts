import { Client, GatewayIntentBits } from 'discord.js';

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent, // needed only when text protection is enabled; harmless otherwise
    ],
  });
}

// MessageContent is a privileged intent — it must be enabled for this bot in the
// Discord Developer Portal (Bot > Privileged Gateway Intents), same as GuildMembers.
// See README for setup instructions.
