import { Router } from 'express';
import { z } from 'zod';
import {
  getGuildConfig, updateGuildConfig, getUsage,
  topActive, activityDaily, getBotStatus,
  activeVoiceSessions, listVoiceSessions, type VoiceSession,
  getCommandFlows, putCommandFlows, listChatMessages,
} from '@gamebot/db';
import { DIALECTS, LANGUAGES, TTS_VOICES, effectiveQuotas, todayKey } from '@gamebot/shared';
import { config, isSuperAdmin } from '../config.js';
import type { DiscordRest, DiscordMember } from '../discord-rest.js';
import type { Session } from '../session.js';
import { requireSession } from '../session.js';
import { listEligibleGuilds, requireGuildAccess } from '../guild-access.js';
import { apiError } from '../app.js';
import { registerAssetRoutes } from './assets.js';
import { registerBotProfileRoutes } from './bot-profile.js';

const ConfigPatch = z
  .object({
    admin_role_id: z.string().nullable().optional(),
    language: z.enum(LANGUAGES).optional(),
    voice: z
      .object({
        enabled: z.boolean().optional(),
        wake_word: z.string().min(2).max(30).optional(),
        dialect: z.enum(DIALECTS).optional(),
        tts_voice: z.enum(TTS_VOICES).optional(),
        allowed_channel_ids: z.array(z.string()).max(50).optional(),
        personality_enabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
    protection: z
      .object({
        enabled: z.boolean().optional(),
        voice_moderation: z.boolean().optional(),
        voice_kick_immediately: z.boolean().optional(),
        text_protection: z.boolean().optional(),
        text_timeout: z.boolean().optional(),
        custom_words: z.array(z.string().min(1).max(60)).max(200).optional(),
        allowed_domains: z.array(z.string().min(3).max(120)).max(200).optional(),
        log_channel_id: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
    welcome: z
      .object({
        enabled: z.boolean().optional(),
        channel_id: z.string().nullable().optional(),
        message: z.string().max(2000).optional(),
        banner_url: z.string().url().nullable().optional(),
        auto_role_id: z.string().nullable().optional(),
        farewell_enabled: z.boolean().optional(),
        farewell_message: z.string().max(2000).optional(),
        avatar_x: z.number().min(0).max(1).optional(),
        avatar_y: z.number().min(0).max(1).optional(),
        avatar_size: z.number().min(0.05).max(0.6).optional(),
        show_name: z.boolean().optional(),
      })
      .strict()
      .optional(),
    summary: z
      .object({
        enabled: z.boolean().optional(),
        channel_id: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export function apiRouter(rest: DiscordRest): Router {
  const router = Router();

  router.get('/meta', async (_req, res) => {
    // Guild count for the landing-page social proof; harmless if unavailable.
    const status = await getBotStatus().catch(() => null);
    res.json({
      clientId: config.DISCORD_CLIENT_ID,
      // 1099799997456 = base set (19926032) + Manage Messages (8192, text-protection
      // deletions) + Manage Roles (268435456, auto role) + Moderate Members
      // (1099511627776, text-protection timeouts).
      inviteUrl: `https://discord.com/oauth2/authorize?client_id=${config.DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=1099799997456`,
      guilds: status?.guild_count ?? 0,
    });
  });

  router.use(requireSession);

  router.get('/me', (_req, res) => {
    const s = res.locals.session as Session;
    res.json({ uid: s.uid, uname: s.uname, avatar: s.avatar });
  });

  router.get('/status', async (_req, res, next) => {
    try {
      res.json(await getBotStatus());
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds', async (_req, res, next) => {
    try {
      res.json(await listEligibleGuilds(rest, res.locals.session as Session));
    } catch (err) {
      next(err);
    }
  });

  const guard = requireGuildAccess(rest);

  router.get('/guilds/:guildId/config', guard, async (req, res, next) => {
    try {
      res.json(await getGuildConfig(req.params.guildId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/info', guard, async (req, res, next) => {
    try {
      const guildId = req.params.guildId;
      const info = await statsCached(`info:${guildId}`, () => rest.getGuildInfo(guildId));
      if (!info) {
        apiError(res, 404, 'NOT_FOUND', 'guild not found');
        return;
      }
      res.json({ ...info, createdAt: snowflakeToDate(guildId) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/channels', guard, async (req, res, next) => {
    try {
      res.json(await rest.listTextChannels(req.params.guildId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/voice-channels', guard, async (req, res, next) => {
    try {
      res.json(await rest.listVoiceChannels(req.params.guildId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/roles', guard, async (req, res, next) => {
    try {
      res.json(await rest.listRoles(req.params.guildId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/emojis', guard, async (req, res, next) => {
    try {
      res.json(await rest.listEmojis(req.params.guildId));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/guilds/:guildId/config', guard, async (req, res, next) => {
    try {
      const parsed = ConfigPatch.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid patch');
        return;
      }
      // Role ids grant rights (admin role) or get assigned to members
      // (auto role) — only accept roles that actually exist in this guild.
      const roleIdsToCheck = [parsed.data.admin_role_id, parsed.data.welcome?.auto_role_id].filter(
        (id): id is string => typeof id === 'string',
      );
      if (roleIdsToCheck.length > 0) {
        const roles = await rest.listRoles(req.params.guildId);
        if (!roleIdsToCheck.every((id) => roles.some((r) => r.id === id))) {
          apiError(res, 400, 'VALIDATION', 'Unknown role for this guild');
          return;
        }
      }
      res.json(await updateGuildConfig(req.params.guildId, parsed.data));
    } catch (err) {
      next(err);
    }
  });

  // Premium-gated: the command-flow editor is a paid feature (super-admin
  // always passes, see hasPremiumAccess).
  router.get('/guilds/:guildId/command-flows', guard, async (req, res, next) => {
    try {
      if (!(await hasPremiumAccess(req.params.guildId, res))) {
        apiError(res, 403, 'PREMIUM_REQUIRED', 'Command flows require premium');
        return;
      }
      res.json(await getCommandFlows(req.params.guildId));
    } catch (err) {
      next(err);
    }
  });

  // Full-document replace — the flow editor always saves its whole draft.
  router.put('/guilds/:guildId/command-flows', guard, async (req, res, next) => {
    try {
      if (!(await hasPremiumAccess(req.params.guildId, res))) {
        apiError(res, 403, 'PREMIUM_REQUIRED', 'Command flows require premium');
        return;
      }
      res.json(await putCommandFlows(req.params.guildId, req.body));
    } catch (err) {
      if (err instanceof z.ZodError) {
        apiError(res, 400, 'VALIDATION', err.issues[0]?.message ?? 'Invalid flows');
        return;
      }
      next(err);
    }
  });

  // Member name search for the flow editor's user picker.
  router.get('/guilds/:guildId/members', guard, async (req, res, next) => {
    try {
      const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
      if (query.length < 2) {
        res.json([]);
        return;
      }
      res.json(await rest.searchMembers(req.params.guildId, query, 20));
    } catch (err) {
      next(err);
    }
  });

  registerStatsRoutes(router, rest); // grown in Task 8
  registerAssetRoutes(router, rest);
  registerBotProfileRoutes(router, rest);

  return router;
}

const DaysParam = z.enum(['7', '30', '90']).default('30');

// Premium gate for paid dashboard features. The super-admin (bot owner)
// always has premium access — no manual grant needed for their own guilds.
async function hasPremiumAccess(guildId: string, res: { locals: { session?: unknown } }): Promise<boolean> {
  const session = res.locals.session as Session | undefined;
  if (session && isSuperAdmin(session.uid)) return true;
  const guildConfig = await getGuildConfig(guildId);
  return guildConfig.premium.active;
}

// Discord REST results (member list + guild counts) are cached in-memory per guild, mirroring
// the TTL-cache pattern in guild-access.ts, so the stats route doesn't hammer Discord on every load.
const STATS_TTL_MS = 5 * 60_000;
const statsCache = new Map<string, { at: number; value: unknown }>();

export function clearStatsCache(): void {
  statsCache.clear();
}

function statsCached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = statsCache.get(key);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return Promise.resolve(hit.value as T);
  return compute().then((value) => {
    statsCache.set(key, { at: Date.now(), value });
    return value;
  });
}

function dateKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// A Discord snowflake encodes its creation time in the high bits: (id >> 22) + epoch.
// Returns null for non-snowflake ids (e.g. test fixtures) so it never throws.
const DISCORD_EPOCH = 1420070400000;
function snowflakeToDate(id: string): string | null {
  if (!/^\d+$/.test(id)) return null;
  return new Date(Number(BigInt(id) >> 22n) + DISCORD_EPOCH).toISOString();
}

// Single source of truth for the window's boundary: must always equal fillDays(days)[0], i.e.
// the earliest day rendered (today - days + 1), so "cutoff" and "first visited day" never drift.
function cutoffKeyFor(days: number): string {
  return fillDays(days)[0];
}

// Every UTC calendar day from (today - days + 1) to today, inclusive — `days` entries total.
// Used to zero/carry-fill sparse per-day series so charts always span the full selected window.
function fillDays(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(dateKeyOf(d));
  }
  return out;
}

function fillSeries<T extends { date: string }>(days: number, series: T[], zeroFactory: (date: string) => T): T[] {
  const byDate = new Map(series.map((item) => [item.date, item]));
  return fillDays(days).map((date) => byDate.get(date) ?? zeroFactory(date));
}

// Cumulative member-growth curve reconstructed from CURRENT members' join dates:
// one point per distinct join-day carrying the running total, extended flat to
// today. Spans the WHOLE server history (independent of the 7/30/90 selector), so
// even a long-established, stable server sees a real growth curve immediately.
// Limitation: survivors only — members who joined and later left are no longer in
// Discord's data, so the curve never dips and slightly understates past peaks.
function joinDateGrowthSeries(members: DiscordMember[]): { date: string; member_count: number }[] {
  if (members.length === 0) return [];
  const sorted = [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const points: { date: string; member_count: number }[] = [];
  let cumulative = 0;
  for (const m of sorted) {
    cumulative += 1;
    const day = m.joined_at.slice(0, 10);
    const last = points[points.length - 1];
    if (last && last.date === day) last.member_count = cumulative;
    else points.push({ date: day, member_count: cumulative });
  }
  const today = dateKeyOf(new Date());
  if (points[points.length - 1]?.date !== today) points.push({ date: today, member_count: cumulative });
  return downsampleSeries(points, 365);
}

// Keep at most `max` points by dropping evenly spaced interior ones; the first and
// last are always retained so the curve's origin and current total stay exact.
function downsampleSeries<T>(series: T[], max: number): T[] {
  if (series.length <= max) return series;
  const step = (series.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => series[Math.round(i * step)]);
}

function registerStatsRoutes(router: Router, rest: DiscordRest): void {
  const guard = requireGuildAccess(rest);

  router.get('/guilds/:guildId/stats', guard, async (req, res, next) => {
    try {
      const parsedDays = DaysParam.safeParse(req.query.days);
      if (!parsedDays.success) {
        apiError(res, 400, 'VALIDATION', 'days must be 7, 30, or 90');
        return;
      }
      const days = Number(parsedDays.data);
      const guildId = req.params.guildId;
      const cutoffKey = cutoffKeyFor(days);

      const [members, counts, activeRows, dailyRows] = await Promise.all([
        statsCached(`members:${guildId}`, () => rest.listMembers(guildId)),
        statsCached(`counts:${guildId}`, () => rest.getGuildCounts(guildId)),
        topActive(guildId, days, 10),
        activityDaily(guildId, days),
      ]);

      const messagesDaily = fillSeries(days, dailyRows.map((r) => ({ date: r.date, count: r.messages })), (date) => ({ date, count: 0 }));
      const voiceMinutesDaily = fillSeries(
        days,
        dailyRows.map((r) => ({ date: r.date, count: Math.round(r.voice_seconds / 60) })),
        (date) => ({ date, count: 0 }),
      );

      const joinedRecent = [...members]
        .sort((a, b) => b.joined_at.localeCompare(a.joined_at))
        .slice(0, 12)
        .map(({ id, username, avatar, joined_at }) => ({ id, username, avatar, joined_at }));

      const newMembers = members.filter((m) => m.joined_at.slice(0, 10) >= cutoffKey).length;

      // Growth = cumulative curve from current members' join dates, full history,
      // independent of the day selector (which still scopes the activity charts).
      const memberSeries = joinDateGrowthSeries(members);

      const memberCount = counts?.approximate_member_count ?? (members.length > 0 ? members.length : null);

      const nameById = new Map(members.map((m) => [m.id, m.username]));
      const topActiveWithNames = activeRows.map((r) => ({
        ...r,
        name: nameById.get(r.user_id) ?? `#${r.user_id.slice(-4)}`,
      }));

      res.json({
        memberCount,
        joinedRecent,
        memberSeries,
        messagesDaily,
        voiceMinutesDaily,
        topActive: topActiveWithNames,
        totals: {
          newMembers,
          messages: dailyRows.reduce((sum, r) => sum + r.messages, 0),
          voiceMinutes: Math.round(dailyRows.reduce((sum, r) => sum + r.voice_seconds, 0) / 60),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Premium-gated like the chat log (owner decision 2026-07-11).
  router.get('/guilds/:guildId/voice-log', guard, async (req, res, next) => {
    try {
      const guildId = req.params.guildId;
      if (!(await hasPremiumAccess(guildId, res))) {
        apiError(res, 403, 'PREMIUM_REQUIRED', 'Voice log requires premium');
        return;
      }
      const [members, voiceChannels, active, sessions] = await Promise.all([
        statsCached(`members:${guildId}`, () => rest.listMembers(guildId)),
        statsCached(`vchannels:${guildId}`, () => rest.listVoiceChannels(guildId)),
        activeVoiceSessions(guildId),
        listVoiceSessions(guildId, 7, 200),
      ]);
      const nameById = new Map(members.map((m) => [m.id, m.username]));
      const channelById = new Map(voiceChannels.map((c) => [c.id, c.name]));
      const serialize = (s: VoiceSession) => ({
        user_id: s.user_id,
        name: nameById.get(s.user_id) ?? `#${s.user_id.slice(-4)}`,
        channel_id: s.channel_id,
        channel_name: channelById.get(s.channel_id) ?? s.channel_id,
        joined_at: s.joined_at.toISOString(),
        left_at: s.left_at ? s.left_at.toISOString() : null,
        seconds: s.seconds,
      });
      res.json({ active: active.map(serialize), sessions: sessions.map(serialize) });
    } catch (err) {
      next(err);
    }
  });

  // Premium-gated: the chat log stores message CONTENT, offered as a paid
  // feature — hard-enforced server-side, not just hidden in the UI.
  router.get('/guilds/:guildId/chat-log', guard, async (req, res, next) => {
    try {
      const guildId = req.params.guildId;
      if (!(await hasPremiumAccess(guildId, res))) {
        apiError(res, 403, 'PREMIUM_REQUIRED', 'Chat log requires premium');
        return;
      }
      const [members, textChannels, messages] = await Promise.all([
        statsCached(`members:${guildId}`, () => rest.listMembers(guildId)),
        statsCached(`tchannels:${guildId}`, () => rest.listTextChannels(guildId)),
        listChatMessages(guildId, 200),
      ]);
      const nameById = new Map(members.map((m) => [m.id, m.username]));
      const channelById = new Map(textChannels.map((c) => [c.id, c.name]));
      res.json({
        messages: messages.map((m) => ({
          user_id: m.user_id,
          name: nameById.get(m.user_id) ?? `#${m.user_id.slice(-4)}`,
          channel_id: m.channel_id,
          channel_name: channelById.get(m.channel_id) ?? m.channel_id,
          content: m.content,
          created_at: m.created_at.toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/usage', guard, async (req, res, next) => {
    try {
      const [guildConfig, usage] = await Promise.all([
        getGuildConfig(req.params.guildId),
        getUsage(req.params.guildId, todayKey()),
      ]);
      res.json({ ...usage, limits: effectiveQuotas(guildConfig), premium_active: guildConfig.premium.active });
    } catch (err) {
      next(err);
    }
  });
}
