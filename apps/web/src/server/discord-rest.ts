export interface DiscordRest {
  exchangeCode(code: string): Promise<{ access_token: string }>;
  getMe(accessToken: string): Promise<{ id: string; username: string; avatar: string | null }>;
  getMyGuilds(accessToken: string): Promise<{ id: string; name: string; icon: string | null; permissions: string }[]>;
  getGuild(guildId: string): Promise<{ id: string; name: string; icon: string | null } | null>;
  getMember(guildId: string, userId: string): Promise<{ roles: string[] } | null>;
  deleteChannel(channelId: string): Promise<void>;
  clearMessageComponents(channelId: string, messageId: string): Promise<void>;
}

export function createDiscordRest(): DiscordRest {
  throw new Error('implemented in Task 5');
}
