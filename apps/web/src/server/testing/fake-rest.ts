import type { DiscordRest } from '../discord-rest.js';

export class FakeDiscordRest implements DiscordRest {
  users = new Map<string, { id: string; username: string; avatar: string | null }>();
  userGuilds = new Map<string, { id: string; name: string; icon: string | null; permissions: string }[]>();
  botGuilds = new Set<string>();
  guildNames = new Map<string, string>();
  members = new Map<string, { roles: string[] }>();
  deletedChannels: string[] = [];
  clearedMessages: string[] = [];

  async exchangeCode(_code: string) {
    return { access_token: 'at-123' };
  }
  async getMe(accessToken: string) {
    const u = this.users.get(accessToken);
    if (!u) throw new Error('unknown token');
    return u;
  }
  async getMyGuilds(accessToken: string) {
    return this.userGuilds.get(accessToken) ?? [];
  }
  async getGuild(guildId: string) {
    return this.botGuilds.has(guildId)
      ? { id: guildId, name: this.guildNames.get(guildId) ?? 'Guild', icon: null }
      : null;
  }
  async getMember(guildId: string, userId: string) {
    return this.members.get(`${guildId}:${userId}`) ?? null;
  }
  async deleteChannel(channelId: string) {
    this.deletedChannels.push(channelId);
  }
  async clearMessageComponents(channelId: string, messageId: string) {
    this.clearedMessages.push(`${channelId}:${messageId}`);
  }
}
