import { DiscordAuthError } from '../discord-rest.js';
import type { DiscordRest, DiscordMember } from '../discord-rest.js';

export class FakeDiscordRest implements DiscordRest {
  users = new Map<string, { id: string; username: string; avatar: string | null }>();
  userGuilds = new Map<string, { id: string; name: string; icon: string | null; permissions: string }[]>();
  botGuilds = new Set<string>();
  guildNames = new Map<string, string>();
  members = new Map<string, { roles: string[] }>();
  membersList = new Map<string, DiscordMember[]>();
  textChannels = new Map<string, { id: string; name: string }[]>();
  guildCounts = new Map<string, number>();
  deletedChannels: string[] = [];
  clearedMessages: string[] = [];
  revokedTokens = new Set<string>();

  async exchangeCode(_code: string) {
    return { access_token: 'at-123' };
  }
  async getMe(accessToken: string) {
    if (this.revokedTokens.has(accessToken)) throw new DiscordAuthError();
    const u = this.users.get(accessToken);
    if (!u) throw new Error('unknown token');
    return u;
  }
  async getMyGuilds(accessToken: string) {
    if (this.revokedTokens.has(accessToken)) throw new DiscordAuthError();
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
  async listMembers(guildId: string, limit = 1000) {
    return (this.membersList.get(guildId) ?? []).slice(0, limit);
  }
  async listTextChannels(guildId: string) {
    return this.textChannels.get(guildId) ?? [];
  }
  async getGuildCounts(guildId: string) {
    const count = this.guildCounts.get(guildId);
    return count === undefined ? null : { approximate_member_count: count };
  }
  async deleteChannel(channelId: string) {
    this.deletedChannels.push(channelId);
  }
  async clearMessageComponents(channelId: string, messageId: string) {
    this.clearedMessages.push(`${channelId}:${messageId}`);
  }
}
