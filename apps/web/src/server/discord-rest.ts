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
  /** Name search via Discord's purpose-built /members/search (username + nick prefix match). */
  searchMembers(
    guildId: string,
    query: string,
    limit?: number,
  ): Promise<{ id: string; username: string; display_name: string; avatar: string | null }[]>;
  listTextChannels(guildId: string): Promise<{ id: string; name: string }[]>;
  listRoles(guildId: string): Promise<{ id: string; name: string }[]>;
  listVoiceChannels(guildId: string): Promise<{ id: string; name: string }[]>;
  listEmojis(guildId: string): Promise<{ id: string; name: string; animated: boolean }[]>;
  getGuildCounts(guildId: string): Promise<{ approximate_member_count: number } | null>;
  getGuildInfo(guildId: string): Promise<{
    name: string;
    icon: string | null;
    memberCount: number | null;
    onlineCount: number | null;
    boostTier: number;
    boostCount: number;
  } | null>;
  /** Makes the bot leave a guild (DELETE /users/@me/guilds/:id with the bot token). */
  leaveGuild(guildId: string): Promise<void>;
  getBotMember(guildId: string): Promise<BotMember | null>;
  editBotMember(guildId: string, patch: { nick?: string | null; avatar?: string | null }): Promise<BotMember>;
  editBotUser(patch: { avatar: string }): Promise<void>;
}

const API = 'https://discord.com/api/v10';

// Safety bound on paginated member fetches (20 pages of 1000). Covers the vast
// majority of guilds; beyond it, the growth chart's daily snapshots (bot-side,
// size-independent) remain the accurate source.
const MAX_MEMBERS_FETCH = 20_000;

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

// `nullOnMissing` maps BOTH 404 (unknown guild) and 403 (bot lacks access —
// e.g. kicked but the session cache hasn't caught up) to null: for every call
// site "the bot can't see this resource" is one condition, not two.
async function discordJson<T>(
  url: string,
  init: RequestInit,
  nullOnMissing = false,
  userToken = false,
): Promise<T | null> {
  const res = await discordFetch(url, init);
  if (userToken && res.status === 401) throw new DiscordAuthError();
  if (nullOnMissing && (res.status === 404 || res.status === 403)) return null;
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
    async listMembers(guildId, limit = MAX_MEMBERS_FETCH) {
      // Discord returns members in ascending user-id order, max 1000 per page, so
      // the NEWEST members sit on the LAST page. A single ?limit=1000 request only
      // returns the OLDEST 1000 — on servers >1000 members that hides every recent
      // join, which flatlines the growth chart and corrupts newMembers/joinedRecent.
      // Paginate with ?after=<lastId> until a short page; `limit` bounds the total
      // so an enormous guild can't spin unbounded.
      const out: DiscordMember[] = [];
      let after = '0';
      while (out.length < limit) {
        const page = await discordJson<{ user: { id: string; username: string; avatar: string | null }; joined_at: string }[]>(
          `${API}/guilds/${guildId}/members?limit=1000&after=${after}`,
          { headers: bot },
          true,
        );
        if (!page || page.length === 0) break;
        for (const m of page) out.push({ id: m.user.id, username: m.user.username, avatar: m.user.avatar, joined_at: m.joined_at });
        if (page.length < 1000) break;
        after = page[page.length - 1].user.id;
      }
      if (out.length >= limit) {
        console.warn(`[discord-rest] listMembers(${guildId}) hit the ${limit} cap; members beyond it are omitted`);
      }
      return out;
    },
    async searchMembers(guildId, query, limit = 20) {
      const page = await discordJson<
        { user: { id: string; username: string; global_name?: string | null; avatar: string | null }; nick: string | null }[]
      >(
        `${API}/guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=${limit}`,
        { headers: bot },
        true,
      );
      if (!page) return [];
      return page.map((m) => ({
        id: m.user.id,
        username: m.user.username,
        display_name: m.nick ?? m.user.global_name ?? m.user.username,
        avatar: m.user.avatar,
      }));
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
    async listEmojis(guildId) {
      const emojis = await discordJson<{ id: string; name: string; animated?: boolean; available?: boolean }[]>(
        `${API}/guilds/${guildId}/emojis`,
        { headers: bot },
        true,
      );
      if (!emojis) return [];
      // `available: false` = emoji lost (e.g. boost level dropped) — unusable in messages.
      return emojis
        .filter((e) => e.available !== false)
        .map((e) => ({ id: e.id, name: e.name, animated: e.animated === true }));
    },
    async getGuildCounts(guildId) {
      return discordJson(`${API}/guilds/${guildId}?with_counts=true`, { headers: bot }, true);
    },
    async getGuildInfo(guildId) {
      // One call with_counts returns name/icon, live member + presence counts and
      // boost tier/count — everything the Overview server card needs.
      const g = await discordJson<{
        name: string;
        icon: string | null;
        approximate_member_count?: number;
        approximate_presence_count?: number;
        premium_tier?: number;
        premium_subscription_count?: number;
      }>(`${API}/guilds/${guildId}?with_counts=true`, { headers: bot }, true);
      if (!g) return null;
      return {
        name: g.name,
        icon: g.icon,
        memberCount: g.approximate_member_count ?? null,
        onlineCount: g.approximate_presence_count ?? null,
        boostTier: g.premium_tier ?? 0,
        boostCount: g.premium_subscription_count ?? 0,
      };
    },
    async leaveGuild(guildId) {
      // Must NOT swallow failures: the admin routes record the guild as left
      // and report success after this call — a swallowed 429/network error
      // would leave the bot in a guild the owner believes was evicted.
      const res = await discordFetch(`${API}/users/@me/guilds/${guildId}`, { method: 'DELETE', headers: bot });
      // 404 = already not a member; that's the desired end state.
      if (!res.ok && res.status !== 404) throw new DiscordApiError(res.status, await res.text().catch(() => ''));
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
