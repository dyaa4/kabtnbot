import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  getGuildConfig, updateGuildConfig,
  topPlayers, getActiveMatch, recentMatches, cancelMatch, adjustPlayerPoints, getUsage,
  memberSnapshots, matchesPerDay, aiUsageDaily, newPlayersPerDay, mostActivePlayers,
} from '@gamebot/db';
import { DIALECTS, effectiveQuotas, todayKey } from '@gamebot/shared';
import { config } from '../config.js';
import type { DiscordRest, DiscordMember } from '../discord-rest.js';
import type { Session } from '../session.js';
import { requireSession } from '../session.js';
import { listEligibleGuilds, requireGuildAccess } from '../guild-access.js';
import { apiError } from '../app.js';

const ConfigPatch = z
  .object({
    voice: z
      .object({
        enabled: z.boolean().optional(),
        wake_word: z.string().min(2).max(30).optional(),
        dialect: z.enum(DIALECTS).optional(),
        allowed_channel_ids: z.array(z.string()).max(50).optional(),
      })
      .strict()
      .optional(),
    customs: z
      .object({
        win_points: z.number().int().min(-1000).max(1000).optional(),
        loss_points: z.number().int().min(-1000).max(1000).optional(),
        admin_role_id: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export function apiRouter(rest: DiscordRest): Router {
  const router = Router();

  router.get('/meta', (_req, res) => {
    res.json({
      clientId: config.DISCORD_CLIENT_ID,
      inviteUrl: `https://discord.com/oauth2/authorize?client_id=${config.DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=19926032`,
    });
  });

  router.use(requireSession);

  router.get('/me', (_req, res) => {
    const s = res.locals.session as Session;
    res.json({ uid: s.uid, uname: s.uname, avatar: s.avatar });
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

  router.patch('/guilds/:guildId/config', guard, async (req, res, next) => {
    try {
      const parsed = ConfigPatch.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid patch');
        return;
      }
      res.json(await updateGuildConfig(req.params.guildId, parsed.data));
    } catch (err) {
      next(err);
    }
  });

  registerStatsRoutes(router, rest); // grown in Task 8

  return router;
}

const AdjustBody = z.object({
  delta: z.number().int().min(-1000).max(1000).refine((d) => d !== 0, 'delta must not be zero'),
});

const DaysParam = z.enum(['7', '30', '90']).default('30');

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

// Limitation (documented per spec): this fallback curve only reflects members still present
// today (survivors) — members who joined and later left are invisible retroactively.
function joinedFallbackSeries(members: DiscordMember[], days: number): { date: string; member_count: number }[] {
  const cutoffKey = cutoffKeyFor(days);
  const sorted = [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const perDayCounts = new Map<string, number>();
  let baseline = 0;
  for (const m of sorted) {
    const key = m.joined_at.slice(0, 10);
    if (key < cutoffKey) {
      baseline += 1;
      continue;
    }
    perDayCounts.set(key, (perDayCounts.get(key) ?? 0) + 1);
  }
  let cumulative = baseline;
  return fillDays(days).map((date) => {
    cumulative += perDayCounts.get(date) ?? 0;
    return { date, member_count: cumulative };
  });
}

// Carries the last known snapshot count forward across every day in the window; days before the
// earliest snapshot are back-filled with that earliest known value (no earlier data exists).
function fillSnapshotSeries(
  snapshots: { date: string; member_count: number }[],
  days: number,
): { date: string; member_count: number }[] {
  const byDate = new Map(snapshots.map((s) => [s.date, s.member_count]));
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  let last = sorted[0]?.member_count ?? 0;
  return fillDays(days).map((date) => {
    const known = byDate.get(date);
    if (known !== undefined) last = known;
    return { date, member_count: last };
  });
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

      const [members, counts, snapshots, matchesRaw, usageRaw, playersRaw, top, mostActiveRaw] = await Promise.all([
        statsCached(`members:${guildId}`, () => rest.listMembers(guildId)),
        statsCached(`counts:${guildId}`, () => rest.getGuildCounts(guildId)),
        memberSnapshots(guildId, days),
        matchesPerDay(guildId, days),
        aiUsageDaily(guildId, days),
        newPlayersPerDay(guildId, days),
        topPlayers(guildId, 5),
        mostActivePlayers(guildId, days, 5),
      ]);

      const matches = fillSeries(days, matchesRaw, (date) => ({ date, count: 0 }));
      const players = fillSeries(days, playersRaw, (date) => ({ date, count: 0 }));
      const usage = fillSeries(days, usageRaw, (date) => ({ date, ai_questions: 0, listen_seconds: 0 }));

      const joinedRecent = [...members]
        .sort((a, b) => b.joined_at.localeCompare(a.joined_at))
        .slice(0, 12)
        .map(({ id, username, avatar, joined_at }) => ({ id, username, avatar, joined_at }));

      const newMembers = members.filter((m) => m.joined_at.slice(0, 10) >= cutoffKey).length;

      let memberSeriesSource: 'snapshots' | 'joined_fallback';
      let memberSeries: { date: string; member_count: number }[];
      if (snapshots.length >= 2) {
        memberSeriesSource = 'snapshots';
        memberSeries = fillSnapshotSeries(snapshots, days);
      } else {
        memberSeriesSource = 'joined_fallback';
        memberSeries = joinedFallbackSeries(members, days);
      }

      const memberCount = counts?.approximate_member_count ?? (members.length > 0 ? members.length : null);

      const totalMatches = matches.reduce((sum, d) => sum + d.count, 0);
      const totalAiQuestions = usage.reduce((sum, d) => sum + d.ai_questions, 0);

      const nameById = new Map(members.map((m) => [m.id, m.username]));
      const topPlayersWithNames = top.map((p) => ({
        ...p,
        name: nameById.get(p.user_id) ?? `#${p.user_id.slice(-4)}`,
      }));
      const mostActive = mostActiveRaw.map((p) => ({
        ...p,
        name: nameById.get(p.user_id) ?? `#${p.user_id.slice(-4)}`,
      }));

      res.json({
        memberCount,
        joinedRecent,
        memberSeries,
        memberSeriesSource,
        matchesPerDay: matches,
        usageDaily: usage,
        newPlayersPerDay: players,
        topPlayers: topPlayersWithNames,
        mostActive,
        totals: { newMembers, matches: totalMatches, aiQuestions: totalAiQuestions },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/leaderboard', guard, async (req, res, next) => {
    try {
      res.json(await topPlayers(req.params.guildId, 10));
    } catch (err) {
      next(err);
    }
  });

  router.get('/guilds/:guildId/matches', guard, async (req, res, next) => {
    try {
      const [active, recent] = await Promise.all([
        getActiveMatch(req.params.guildId),
        recentMatches(req.params.guildId, 10),
      ]);
      res.json({ active, recent });
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

  router.post('/guilds/:guildId/matches/:matchId/cancel', guard, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.matchId)) {
        apiError(res, 404, 'NO_ACTIVE_MATCH', 'No active match to cancel');
        return;
      }
      const cancelled = await cancelMatch(req.params.guildId, req.params.matchId);
      if (!cancelled) {
        apiError(res, 404, 'NO_ACTIVE_MATCH', 'No active match to cancel');
        return;
      }
      await Promise.allSettled(cancelled.temp_channel_ids.map((id) => rest.deleteChannel(id)));
      if (cancelled.lobby_message_id) {
        await rest.clearMessageComponents(cancelled.lobby_channel_id, cancelled.lobby_message_id).catch(() => {});
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/guilds/:guildId/players/:userId/adjust', guard, async (req, res, next) => {
    try {
      const parsed = AdjustBody.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, 400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid delta');
        return;
      }
      res.json(await adjustPlayerPoints(req.params.guildId, req.params.userId, parsed.data.delta));
    } catch (err) {
      next(err);
    }
  });
}
