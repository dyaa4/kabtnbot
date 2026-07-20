import { DiscordAuthError, DiscordApiError, OAuthError } from '../discord-rest.js';
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
  guildInfo = new Map<
    string,
    { name: string; icon: string | null; memberCount: number | null; onlineCount: number | null; boostTier: number; boostCount: number }
  >();
  leftGuilds: string[] = [];
  revokedTokens = new Set<string>();
  botUser = { id: 'bot1', username: 'kabtn', avatar: null as string | null };
  botProfiles = new Map<string, { nick: string | null; avatar: string | null }>();
  supportsGuildAvatar = true;
  forbidNickname = false;
  globalAvatar: string | null = null;
  // Access token that exchangeCode issues for any OAuth code (override per scenario).
  exchangeToken = 'at-123';
  // Set to a Discord OAuth error code (e.g. 'invalid_client') to simulate a
  // failed token exchange.
  oauthError: string | null = null;

  async exchangeCode(_code: string) {
    if (this.oauthError) throw new OAuthError(401, this.oauthError);
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
  guildOwners = new Map<string, string>();
  async getGuild(guildId: string) {
    return this.botGuilds.has(guildId)
      ? { id: guildId, name: this.guildNames.get(guildId) ?? 'Guild', icon: null }
      : null;
  }
  async getGuildOwnerId(guildId: string) {
    return this.guildOwners.get(guildId) ?? null;
  }
  async getMember(guildId: string, userId: string) {
    return this.members.get(`${guildId}:${userId}`) ?? null;
  }
  async listMembers(guildId: string, limit = 1000) {
    return (this.membersList.get(guildId) ?? []).slice(0, limit);
  }
  async searchMembers(guildId: string, query: string, limit = 20) {
    const q = query.toLowerCase();
    return (this.membersList.get(guildId) ?? [])
      .filter((m) => m.username.toLowerCase().includes(q))
      .slice(0, limit)
      .map((m) => ({ id: m.id, username: m.username, display_name: m.username, avatar: m.avatar }));
  }
  async listTextChannels(guildId: string) {
    return this.textChannels.get(guildId) ?? [];
  }
  allChannels = new Map<string, { id: string; name: string; type: number; position: number; parent_id: string | null }[]>();
  private channelSeq = 0;
  forbidManageChannels = false;
  async listAllChannels(guildId: string) {
    return this.allChannels.get(guildId) ?? [];
  }
  async createChannel(guildId: string, body: { name: string; type: number; parent_id?: string | null }) {
    if (this.forbidManageChannels) throw new DiscordApiError(403, 'Missing Permissions');
    const list = this.allChannels.get(guildId) ?? [];
    const id = `new-${++this.channelSeq}`;
    list.push({ id, name: body.name, type: body.type, position: list.length, parent_id: body.parent_id ?? null });
    this.allChannels.set(guildId, list);
    return { id };
  }
  private findChannel(channelId: string) {
    for (const list of this.allChannels.values()) {
      const c = list.find((x) => x.id === channelId);
      if (c) return c;
    }
    return null;
  }
  async editChannel(channelId: string, patch: { name?: string; parent_id?: string | null }) {
    if (this.forbidManageChannels) throw new DiscordApiError(403, 'Missing Permissions');
    const c = this.findChannel(channelId);
    if (!c) throw new DiscordApiError(404, 'Unknown Channel');
    if (patch.name !== undefined) c.name = patch.name;
    if (patch.parent_id !== undefined) c.parent_id = patch.parent_id;
  }
  async deleteChannel(channelId: string) {
    for (const [g, list] of this.allChannels.entries()) {
      const i = list.findIndex((x) => x.id === channelId);
      if (i >= 0) {
        list.splice(i, 1);
        this.allChannels.set(g, list);
        return;
      }
    }
  }
  async modifyChannelPositions(
    guildId: string,
    positions: { id: string; position: number; parent_id?: string | null }[],
  ) {
    if (this.forbidManageChannels) throw new DiscordApiError(403, 'Missing Permissions');
    const list = this.allChannels.get(guildId) ?? [];
    for (const p of positions) {
      const c = list.find((x) => x.id === p.id);
      if (!c) continue;
      c.position = p.position;
      if (p.parent_id !== undefined) c.parent_id = p.parent_id;
    }
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
  async getGuildInfo(guildId: string) {
    return this.guildInfo.get(guildId) ?? null;
  }
  async getUser(_userId: string) {
    return null;
  }

  async leaveGuild(guildId: string) {
    this.leftGuilds.push(guildId);
  }
  guildCommands = new Map<string, { name: string; description: string }[]>();
  async setGuildCommands(guildId: string, commands: { name: string; description: string }[]) {
    this.guildCommands.set(guildId, commands);
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
