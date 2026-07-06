import { DiscordAuthError, DiscordApiError } from '../discord-rest.js';
import type { DiscordRest, DiscordMember, BotMember } from '../discord-rest.js';

export class FakeDiscordRest implements DiscordRest {
  users = new Map<string, { id: string; username: string; avatar: string | null }>();
  userGuilds = new Map<string, { id: string; name: string; icon: string | null; permissions: string }[]>();
  botGuilds = new Set<string>();
  guildNames = new Map<string, string>();
  members = new Map<string, { roles: string[] }>();
  membersList = new Map<string, DiscordMember[]>();
  textChannels = new Map<string, { id: string; name: string }[]>();
  roles = new Map<string, { id: string; name: string }[]>();
  voiceChannels = new Map<string, { id: string; name: string }[]>();
  emojis = new Map<string, { id: string; name: string; animated: boolean }[]>();
  guildCounts = new Map<string, number>();
  deletedChannels: string[] = [];
  clearedMessages: string[] = [];
  revokedTokens = new Set<string>();
  botUser = { id: 'bot1', username: 'kabtn', avatar: null as string | null };
  botProfiles = new Map<string, { nick: string | null; avatar: string | null }>();
  supportsGuildAvatar = true;
  forbidNickname = false;
  globalAvatar: string | null = null;
  // Access token that exchangeCode issues for any OAuth code (override per scenario).
  exchangeToken = 'at-123';

  async exchangeCode(_code: string) {
    return { access_token: this.exchangeToken };
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
  async listRoles(guildId: string) {
    return this.roles.get(guildId) ?? [];
  }
  async listVoiceChannels(guildId: string) {
    return this.voiceChannels.get(guildId) ?? [];
  }
  async listEmojis(guildId: string) {
    return this.emojis.get(guildId) ?? [];
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
  async getBotMember(guildId: string): Promise<BotMember | null> {
    if (!this.botGuilds.has(guildId)) return null;
    const p = this.botProfiles.get(guildId) ?? { nick: null, avatar: null };
    return { nick: p.nick, avatar: p.avatar, user: this.botUser };
  }
  async editBotMember(guildId: string, patch: { nick?: string | null; avatar?: string | null }): Promise<BotMember> {
    if (patch.nick !== undefined && this.forbidNickname) throw new DiscordApiError(403, 'Missing Permissions');
    const p = this.botProfiles.get(guildId) ?? { nick: null, avatar: null };
    if (patch.nick !== undefined) p.nick = patch.nick;
    // Mirrors Discord's behavior when guild avatars are unsupported: the unknown
    // field is silently ignored, so the returned member has no guild avatar.
    if (patch.avatar !== undefined && this.supportsGuildAvatar) p.avatar = patch.avatar === null ? null : 'hash-guild';
    this.botProfiles.set(guildId, p);
    return { nick: p.nick, avatar: p.avatar, user: this.botUser };
  }
  async editBotUser(patch: { avatar: string }): Promise<void> {
    this.globalAvatar = patch.avatar;
    this.botUser.avatar = 'hash-global';
  }
}
