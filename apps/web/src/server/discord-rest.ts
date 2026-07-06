import { config } from './config.js';

export interface DiscordMember {
  id: string;
  username: string;
  avatar: string | null;
  joined_at: string;
}

export interface BotMember {
  nick: string | null;
  avatar: string | null; // guild-specific avatar hash
  user: { id: string; username: string; avatar: string | null };
}

export interface DiscordRest {
  exchangeCode(code: string): Promise<{ access_token: string }>;
  getMe(accessToken: string): Promise<{ id: string; username: string; avatar: string | null }>;
  getMyGuilds(accessToken: string): Promise<{ id: string; name: string; icon: string | null; permissions: string }[]>;
  getGuild(guildId: string): Promise<{ id: string; name: string; icon: string | null } | null>;
  getMember(guildId: string, userId: string): Promise<{ roles: string[] } | null>;
  listMembers(guildId: string, limit?: number): Promise<DiscordMember[]>;
  listTextChannels(guildId: string): Promise<{ id: string; name: string }[]>;
  listRoles(guildId: string): Promise<{ id: string; name: string }[]>;
  listVoiceChannels(guildId: string): Promise<{ id: string; name: string }[]>;
  getGuildCounts(guildId: string): Promise<{ approximate_member_count: number } | null>;
  deleteChannel(channelId: string): Promise<void>;
  clearMessageComponents(channelId: string, messageId: string): Promise<void>;
  getBotMember(guildId: string): Promise<BotMember | null>;
  editBotMember(guildId: string, patch: { nick?: string | null; avatar?: string | null }): Promise<BotMember>;
  editBotUser(patch: { avatar: string }): Promise<void>;
}

const API = 'https://discord.com/api/v10';

export class DiscordAuthError extends Error {
  constructor() {
    super('DISCORD_AUTH_REVOKED');
  }
}

// Carries the Discord HTTP status so routes can map e.g. 403 (missing permission)
// to a friendly API error instead of a generic 500.
export class DiscordApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Discord rate-limits aggressively (429 + Retry-After in seconds). Retry once
// after the advertised wait (capped) so a transient limit doesn't surface as a
// 500 in the dashboard.
const RETRY_AFTER_CAP_MS = 5000;

export async function discordFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 429) return res;
  const after = Number(res.headers.get('retry-after'));
  const waitMs = Math.min((Number.isFinite(after) && after >= 0 ? after : 1) * 1000, RETRY_AFTER_CAP_MS);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return fetch(url, init);
}

async function discordJson<T>(
  url: string,
  init: RequestInit,
  allow404 = false,
  userToken = false,
): Promise<T | null> {
  const res = await discordFetch(url, init);
  if (userToken && res.status === 401) throw new DiscordAuthError();
  if (allow404 && (res.status === 404 || res.status === 403)) return null;
  if (!res.ok) throw new Error(`Discord ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export function createDiscordRest(): DiscordRest {
  const bot = { Authorization: `Bot ${config.DISCORD_TOKEN}` };
  return {
    async exchangeCode(code) {
      const body = new URLSearchParams({
        client_id: config.DISCORD_CLIENT_ID,
        client_secret: config.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${config.WEB_BASE_URL}/auth/callback`,
      });
      return (await discordJson(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }))!;
    },
    async getMe(accessToken) {
      return (await discordJson(
        `${API}/users/@me`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        false,
        true,
      ))!;
    },
    async getMyGuilds(accessToken) {
      return (await discordJson(
        `${API}/users/@me/guilds`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        false,
        true,
      ))!;
    },
    async getGuild(guildId) {
      return discordJson(`${API}/guilds/${guildId}`, { headers: bot }, true);
    },
    async getMember(guildId, userId) {
      return discordJson(`${API}/guilds/${guildId}/members/${userId}`, { headers: bot }, true);
    },
    async listMembers(guildId, limit = 1000) {
      const capped = Math.min(limit, 1000);
      const members = await discordJson<{ user: { id: string; username: string; avatar: string | null }; joined_at: string }[]>(
        `${API}/guilds/${guildId}/members?limit=${capped}`,
        { headers: bot },
        true,
      );
      if (!members) return [];
      return members.map((m) => ({ id: m.user.id, username: m.user.username, avatar: m.user.avatar, joined_at: m.joined_at }));
    },
    async listTextChannels(guildId) {
      const channels = await discordJson<{ id: string; name: string; type: number }[]>(
        `${API}/guilds/${guildId}/channels`,
        { headers: bot },
        true,
      );
      if (!channels) return [];
      // Discord channel types: 0 = text, 5 = announcement — both accept messages.
      return channels.filter((c) => c.type === 0 || c.type === 5).map((c) => ({ id: c.id, name: c.name }));
    },
    async listVoiceChannels(guildId) {
      const channels = await discordJson<{ id: string; name: string; type: number }[]>(
        `${API}/guilds/${guildId}/channels`,
        { headers: bot },
        true,
      );
      if (!channels) return [];
      // Discord channel types: 2 = voice, 13 = stage.
      return channels.filter((c) => c.type === 2 || c.type === 13).map((c) => ({ id: c.id, name: c.name }));
    },
    async listRoles(guildId) {
      const roles = await discordJson<{ id: string; name: string; position: number; managed: boolean }[]>(
        `${API}/guilds/${guildId}/roles`,
        { headers: bot },
        true,
      );
      if (!roles) return [];
      // Drop @everyone (id === guildId) and managed bot/integration roles —
      // neither can be handed to a human moderator.
      return roles
        .filter((r) => r.id !== guildId && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name }));
    },
    async getGuildCounts(guildId) {
      return discordJson(`${API}/guilds/${guildId}?with_counts=true`, { headers: bot }, true);
    },
    async deleteChannel(channelId) {
      await fetch(`${API}/channels/${channelId}`, { method: 'DELETE', headers: bot }).catch(() => {});
    },
    async clearMessageComponents(channelId, messageId) {
      await fetch(`${API}/channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        headers: { ...bot, 'Content-Type': 'application/json' },
        body: JSON.stringify({ components: [] }),
      }).catch(() => {});
    },
    async getBotMember(guildId) {
      return discordJson<BotMember>(
        `${API}/guilds/${guildId}/members/${config.DISCORD_CLIENT_ID}`,
        { headers: bot },
        true,
      );
    },
    async editBotMember(guildId, patch) {
      const res = await discordFetch(`${API}/guilds/${guildId}/members/@me`, {
        method: 'PATCH',
        headers: { ...bot, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new DiscordApiError(res.status, await res.text().catch(() => ''));
      return (await res.json()) as BotMember;
    },
    async editBotUser(patch) {
      const res = await discordFetch(`${API}/users/@me`, {
        method: 'PATCH',
        headers: { ...bot, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new DiscordApiError(res.status, await res.text().catch(() => ''));
    },
  };
}
