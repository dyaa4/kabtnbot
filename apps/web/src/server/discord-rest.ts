import { config } from './config.js';

export interface DiscordRest {
  exchangeCode(code: string): Promise<{ access_token: string }>;
  getMe(accessToken: string): Promise<{ id: string; username: string; avatar: string | null }>;
  getMyGuilds(accessToken: string): Promise<{ id: string; name: string; icon: string | null; permissions: string }[]>;
  getGuild(guildId: string): Promise<{ id: string; name: string; icon: string | null } | null>;
  getMember(guildId: string, userId: string): Promise<{ roles: string[] } | null>;
  deleteChannel(channelId: string): Promise<void>;
  clearMessageComponents(channelId: string, messageId: string): Promise<void>;
}

const API = 'https://discord.com/api/v10';

async function discordJson<T>(url: string, init: RequestInit, allow404 = false): Promise<T | null> {
  const res = await fetch(url, init);
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
      return (await discordJson(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } }))!;
    },
    async getMyGuilds(accessToken) {
      return (await discordJson(`${API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` } }))!;
    },
    async getGuild(guildId) {
      return discordJson(`${API}/guilds/${guildId}`, { headers: bot }, true);
    },
    async getMember(guildId, userId) {
      return discordJson(`${API}/guilds/${guildId}/members/${userId}`, { headers: bot }, true);
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
  };
}
