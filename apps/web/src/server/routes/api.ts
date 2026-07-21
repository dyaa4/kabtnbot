import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  getGuildConfig, updateGuildConfig, getUsage,
  topActive, activityDaily, getBotStatus,
  activeVoiceSessions, listVoiceSessions, type VoiceSession,
  getCommandFlows, putCommandFlows, resetScheduleRuns, listChatMessages,
  getUserPlan, linkGuild, unlinkGuild, isGuildLinked, isGuildPremium, getPremiumLinker, isUserBlocked, isDbConnected,
  countActiveInvitedGuilds, hasOrganizeSnapshot,
} from '@gamebot/db';
import { LANGUAGES, TTS_VOICES, effectiveQuotas, monthKey, ORGANIZABLE_TYPES } from '@gamebot/shared';
import { config, isSuperAdmin } from '../config.js';
import type { DiscordRest, DiscordMember } from '../discord-rest.js';
import type { Session } from '../session.js';
import { requireSession } from '../session.js';
import { hasPremiumAccess, invalidateGuildListCache, listEligibleGuilds, requireGuildAccess } from '../guild-access.js';
import { apiError } from '../app.js';
import { registerAssetRoutes } from './assets.js';
import { registerBotProfileRoutes } from './bot-profile.js';
import { generateOrganizePlan, isOrganizerConfigured, AiPlanError } from '../channel-organizer.js';
import { applyOrganizePlan, undoOrganize, InvalidPlanError, SnapshotExistsError } from '../channel-apply.js';
import { consumeOrganizeQuota, refundOrganizeQuota, getOrganizeUsage } from '../organize-quota.js';
import { DiscordApiError } from '../discord-rest.js';

const ConfigPatch = z
  .object({
    admin_role_id: z.string().nullable().optional(),
    language: z.enum(LANGUAGES).optional(),
    voice: z
      .object({
        enabled: z.boolean().optional(),
        wake_word: z.string().min(2).max(30).optional(),
        tts_voice: z.enum(TTS_VOICES).optional(),
        allowed_channel_ids: z.array(z.string()).max(50).optional(),
        personality_enabled: z.boolean().optional(),
        follow_up_seconds: z.number().int().min(0).max(120).optional(),
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
        blocked_domains: z.array(z.string().min(3).max(120)).max(200).optional(),
        anti_spam: z.boolean().optional(),
        log_channel_id: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
    welcome: z
      .object({
        enabled: z.boolean().optional(),
        channel_id: z.string().nullable().optional(),
        message: z.string().max(2000).optional(),
        // https only — the bot's welcome-image renderer refuses non-https URLs
        // at send time, so accepting http here would just break banners silently.
        banner_url: z.string().url().startsWith('https://', 'banner_url must be https').nullable().optional(),
        auto_role_id: z.string().nullable().optional(),
        farewell_enabled: z.boolean().optional(),
        farewell_message: z.string().max(2000).optional(),
        farewell_channel_id: z.string().nullable().optional(),
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
      // Permissions include VIEW_AUDIT_LOG (128): guildCreate reads the audit
      // log to attribute who invited the bot (per-user invite cap).
      inviteUrl: `https://discord.com/oauth2/authorize?client_id=${config.DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=1099799997584`,
      guilds: status?.guild_count ?? 0,
    });
  });

  router.use(requireSession);

  // Blocked accounts lose ALL dashboard API access (cached 60s per user; the
  // super-admin can never lock themselves out).
  const blockedCache = new Map<string, { at: number; value: boolean }>();
  router.use(async (_req, res, next) => {
    try {
      const s = res.locals.session as Session;
      // Fail OPEN without a DB (tests, transient outage) — blocking is a
      // moderation convenience, not a security boundary.
      if (isSuperAdmin(s.uid) || !isDbConnected()) {
        next();
        return;
      }
      const hit = blockedCache.get(s.uid);
      const blocked =
        hit && Date.now() - hit.at < 60_000 ? hit.value : await isUserBlocked(s.uid);
      blockedCache.set(s.uid, { at: Date.now(), value: blocked });
      if (blocked) {
        apiError(res, 403, 'USER_BLOCKED', 'This account is blocked');
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', (_req, res) => {
    const s = res.locals.session as Session;
    res.json({ uid: s.uid, uname: s.uname, avatar: s.avatar });
  });

  // Per-user plan: premium flag, link allowance and the linked guild ids.
  router.get('/me/plan', async (_req, res, next) => {
    try {
      const uid = (res.locals.session as Session).uid;
      const plan = await getUserPlan(uid);
      // Only audit-log-attributed guilds count — unknown inviters stay free.
      res.json({ ...plan, invited_guild_count: await countActiveInvitedGuilds(uid) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/status', async (_req, res, next) => {
    try {
      res.json(await getBotStatus());
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds', async (req, res, next) => {
    try {
      const s = res.locals.session as Session;
      // fresh=1: the client just came back from a bot invite — the 60s list
      // cache would hide the new guild, so drop it for this user first.
      if (req.query.fresh === '1') invalidateGuildListCache(s.uid);
      res.json(await listEligibleGuilds(rest, s));
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

  // Link/unlink a guild to the session user's plan. The guard already
  // guarantees the user administers this guild ("their own" server).
  router.post('/guilds/:guildId/link', guard, async (req, res, next) => {
    try {
      const plan = await linkGuild((res.locals.session as Session).uid, req.params.guildId);
      if (!plan) {
        apiError(res, 409, 'LINK_LIMIT', 'link limit reached for this plan');
        return;
      }
      res.json(plan);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/guilds/:guildId/link', guard, async (req, res, next) => {
    try {
      res.json(await unlinkGuild((res.locals.session as Session).uid, req.params.guildId));
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
      // Fresh isGuildLinked read (NOT statsCached): a guild the user just
      // linked must unlock the premium tabs immediately, not after a TTL.
      const [premiumLinked, premiumActive] = await Promise.all([
        isGuildLinked(guildId),
        isGuildPremium(guildId),
      ]);
      // premiumLinked gates the linked-tier features (logs/flows/customize);
      // premiumActive gates the strictly-premium voice assistant.
      res.json({ ...info, createdAt: snowflakeToDate(guildId), premiumLinked, premiumActive });
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

  // AI channel organizer — generate a proposed layout for PREVIEW only (no
  // Discord writes). Each call spends an LLM request, so it is strictly premium
  // (a PREMIUM-linked guild, like the voice assistant) and rate-limited.
  const organizeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many organize requests, try again later' } },
  });
  router.post('/guilds/:guildId/channels/organize/preview', guard, organizeLimiter, async (req, res, next) => {
    const guildId = req.params.guildId;
    const isAdmin = isSuperAdmin((res.locals.session as Session).uid);
    try {
      if (!isAdmin && !(await isGuildPremium(guildId))) {
        apiError(res, 403, 'PREMIUM_REQUIRED', 'The AI channel organizer requires a premium account');
        return;
      }
      if (!isOrganizerConfigured()) {
        apiError(res, 503, 'AI_UNAVAILABLE', 'The AI organizer is not configured');
        return;
      }
      // Each generation spends one of the monthly allowance (pooled per premium
      // account). Super-admins bypass the cap. Consumed up-front, refunded if the
      // AI call fails so a broken generation is never charged.
      if (!isAdmin) {
        const quota = await consumeOrganizeQuota(guildId);
        if (!quota.ok) {
          apiError(res, 429, 'ORGANIZE_LIMIT', `Monthly limit reached (${quota.usage.limit} per month)`);
          return;
        }
      }
      const otherLabel =
        typeof req.body?.otherLabel === 'string' && req.body.otherLabel.trim()
          ? req.body.otherLabel.trim().slice(0, 80)
          : 'Other';
      let channels;
      let plan;
      try {
        channels = await rest.listAllChannels(guildId);
        // Nothing to organize → refund (don't burn a generation on the LLM for
        // an empty result) and tell the user, rather than returning {categories:[]}.
        if (!channels.some((c) => (ORGANIZABLE_TYPES as readonly number[]).includes(c.type))) {
          if (!isAdmin) await refundOrganizeQuota(guildId);
          apiError(res, 400, 'NO_CHANNELS', 'This server has no channels to organize');
          return;
        }
        plan = await generateOrganizePlan(channels, otherLabel);
      } catch (genErr) {
        // Refund only around the generation itself — a failure AFTER this (usage
        // read / serialization) must not hand back a generation that was spent.
        if (!isAdmin) await refundOrganizeQuota(guildId);
        throw genErr;
      }
      const usage = await getOrganizeUsage(guildId);
      res.json({ channels, plan, usage });
    } catch (err) {
      if (err instanceof AiPlanError) {
        apiError(res, 502, 'AI_BAD_OUTPUT', 'The AI returned an unusable layout, please try again');
        return;
      }
      next(err);
    }
  });

  const isOrganizerPremium = async (guildId: string, res: import('express').Response): Promise<boolean> =>
    isSuperAdmin((res.locals.session as Session).uid) || (await isGuildPremium(guildId));

  // Whether the last apply can still be undone (a snapshot exists, <24h old).
  router.get('/guilds/:guildId/channels/organize/status', guard, async (req, res, next) => {
    try {
      const [canUndo, usage] = await Promise.all([
        hasOrganizeSnapshot(req.params.guildId),
        getOrganizeUsage(req.params.guildId),
      ]);
      res.json({ canUndo, usage });
    } catch (err) {
      next(err);
    }
  });

  // Apply an approved plan to the guild (create/rename categories, reorder,
  // reparent, rename channels) after snapshotting the current layout for undo.
  router.post('/guilds/:guildId/channels/organize/apply', guard, organizeLimiter, async (req, res, next) => {
    try {
      if (!(await isOrganizerPremium(req.params.guildId, res))) {
        apiError(res, 403, 'PREMIUM_REQUIRED', 'The AI channel organizer requires a premium account');
        return;
      }
      const otherLabel =
        typeof req.body?.otherLabel === 'string' && req.body.otherLabel.trim()
          ? req.body.otherLabel.trim().slice(0, 80)
          : 'Other';
      const result = await applyOrganizePlan(rest, req.params.guildId, req.body?.plan, otherLabel);
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof InvalidPlanError) {
        apiError(res, 400, 'INVALID_PLAN', 'The layout to apply is invalid');
        return;
      }
      if (err instanceof SnapshotExistsError) {
        apiError(res, 409, 'SNAPSHOT_EXISTS', 'Undo the previous organize before applying a new layout');
        return;
      }
      if (err instanceof DiscordApiError && err.status === 403) {
        apiError(res, 403, 'BOT_MISSING_PERMISSION', 'The bot needs the Manage Channels permission to reorganize channels');
        return;
      }
      next(err);
    }
  });

  // Revert the last apply from the stored snapshot.
  router.post('/guilds/:guildId/channels/organize/undo', guard, organizeLimiter, async (req, res, next) => {
    try {
      if (!(await isOrganizerPremium(req.params.guildId, res))) {
        apiError(res, 403, 'PREMIUM_REQUIRED', 'The AI channel organizer requires a premium account');
        return;
      }
      const done = await undoOrganize(rest, req.params.guildId);
      if (!done) {
        apiError(res, 404, 'NO_SNAPSHOT', 'There is nothing to undo');
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof DiscordApiError && err.status === 403) {
        apiError(res, 403, 'BOT_MISSING_PERMISSION', 'The bot needs the Manage Channels permission to undo');
        return;
      }
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
      // The voice assistant is STRICTLY premium (owner decision 2026-07-19):
      // its settings require a guild linked by a PREMIUM account — a free
      // account's link is not enough (unlike logs/flows/customize). All other
      // config sections (general settings, protection, welcome…) stay free.
      if (parsed.data.voice !== undefined) {
        const session = res.locals.session as Session;
        const allowed = isSuperAdmin(session.uid) || (await isGuildPremium(req.params.guildId));
        if (!allowed) {
          apiError(res, 403, 'PREMIUM_REQUIRED', 'Voice assistant settings require a premium account');
          return;
        }
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
      // NOTE: configured channel ids are intentionally NOT rejected when they
      // don't currently exist. A channel referenced in the config (e.g. an
      // allowed voice channel or a log channel) may have been DELETED since it
      // was set; validating here made the whole save fail — a user couldn't even
      // change follow_up_seconds while a stale allowed_channel_id lingered. The
      // bot already resolves channel ids via this guild's own channel cache and
      // safely ignores misses, so a stale id is harmless.
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
      const before = await getCommandFlows(req.params.guildId);
      const saved = await putCommandFlows(req.params.guildId, req.body);
      // A changed schedule resets that flow's run bookkeeping: a new daily
      // time must take effect today (not be blocked by an older stamp) and an
      // edited run limit must count from zero again. Best-effort like the
      // slash sync below.
      const prevSchedules = new Map(before.flows.map((f) => [f.id, JSON.stringify(f.schedule)]));
      await Promise.all(
        saved.flows
          .filter((f) => {
            const prev = prevSchedules.get(f.id);
            return prev !== undefined && prev !== JSON.stringify(f.schedule);
          })
          .map((f) => resetScheduleRuns(req.params.guildId, f.id).catch(() => {})),
      );
      // Mirror flows with a slash_name into Discord's per-guild slash commands
      // (PUT replaces the guild set, so removals disappear too). Best-effort:
      // a Discord hiccup must not fail the save itself.
      await rest
        .setGuildCommands(
          req.params.guildId,
          saved.flows
            .filter((f) => f.enabled && f.slash_name)
            .map((f) => ({ name: f.slash_name, description: f.name })),
        )
        .catch((err) => console.error('[slash-sync]', req.params.guildId, err));
      res.json(saved);
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

  // Resolve saved member ids to names — pickers reloaded from a stored config
  // would otherwise render raw snowflakes. Uses the cached member list, so a
  // burst of pickers on one page costs a single Discord fetch.
  router.get('/guilds/:guildId/members/names', guard, async (req, res, next) => {
    try {
      const ids = String(req.query.ids ?? '').split(',').filter(Boolean).slice(0, 100);
      const members = await statsCached(`members:${req.params.guildId}`, () => rest.listMembers(req.params.guildId));
      const byId = new Map(members.map((m) => [m.id, m.username]));
      res.json(Object.fromEntries(ids.map((id) => [id, byId.get(id) ?? null])));
    } catch (err) {
      next(err);
    }
  });

  registerStatsRoutes(router, rest);
  registerAssetRoutes(router, rest);
  registerBotProfileRoutes(router, rest);

  return router;
}

const DaysParam = z.enum(['7', '30', '90']).default('30');


// Discord REST results (member list + guild counts) are cached in-memory per guild,
// mirroring the PROMISE-cache pattern in guild-access.ts: caching the in-flight
// promise (not just the resolved value) makes concurrent cold-cache requests —
// e.g. /stats + /voice-log firing together on dashboard load — share ONE Discord
// call instead of stampeding a paginated member fetch into a 429.
const STATS_TTL_MS = 5 * 60_000;
const statsCache = new Map<string, { at: number; value: Promise<unknown> }>();

export function clearStatsCache(): void {
  statsCache.clear();
}

function statsCached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = statsCache.get(key);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.value as Promise<T>;
  // Sweep expired entries — member arrays are large, and entries for guilds
  // nobody revisits would otherwise sit in memory forever.
  for (const [k, v] of statsCache) {
    if (Date.now() - v.at >= STATS_TTL_MS) statsCache.delete(k);
  }
  const value = compute();
  statsCache.set(key, { at: Date.now(), value });
  // A failed fetch must not be served for the next 5 minutes.
  value.catch(() => {
    if (statsCache.get(key)?.value === value) statsCache.delete(key);
  });
  return value;
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
      const [members, textChannels, voiceChannels, messages, status] = await Promise.all([
        statsCached(`members:${guildId}`, () => rest.listMembers(guildId)),
        statsCached(`tchannels:${guildId}`, () => rest.listTextChannels(guildId)),
        statsCached(`vchannels:${guildId}`, () => rest.listVoiceChannels(guildId)),
        listChatMessages(guildId, 200),
        getBotStatus().catch(() => null),
      ]);
      const nameById = new Map(members.map((m) => [m.id, m.username]));
      // Voice channels too: messages in a voice channel's built-in text chat
      // carry the voice channel's id and would otherwise render as a raw id.
      const channelById = new Map([...textChannels, ...voiceChannels].map((c) => [c.id, c.name]));
      res.json({
        // Recording is env-gated on the BOT service — surface it so the UI can
        // explain an empty log instead of showing "no messages yet" forever.
        recording: status?.features?.chat_log ?? false,
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
      const [guildConfig, linked, owner] = await Promise.all([
        getGuildConfig(req.params.guildId),
        isGuildLinked(req.params.guildId),
        getPremiumLinker(req.params.guildId),
      ]);
      // MONTHLY quotas pooled per premium ACCOUNT: the bars show the shared
      // `user:<uid>` pool this guild draws from (its own row when unlinked).
      const usage = await getUsage(owner ? `user:${owner}` : req.params.guildId, monthKey());
      // limits reflect PREMIUM linking (monthly quotas); premium_active
      // keeps its existing meaning of "linked by anyone" (feature gate).
      res.json({ ...usage, limits: effectiveQuotas(guildConfig, owner !== null), premium_active: linked });
    } catch (err) {
      next(err);
    }
  });
}
