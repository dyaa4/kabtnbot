import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface SeriesPoint {
  date: string;
  count?: number;
  member_count?: number;
}
interface UsagePoint {
  date: string;
  ai_questions: number;
  listen_seconds: number;
}
interface TopPlayer {
  user_id: string;
  points: number;
  wins: number;
  losses: number;
}
interface JoinedMember {
  id: string;
  username: string;
  avatar: string | null;
  joined_at: string;
}
interface StatsResp {
  memberCount: number | null;
  joinedRecent: JoinedMember[];
  memberSeries: SeriesPoint[];
  memberSeriesSource: 'snapshots' | 'joined_fallback';
  matchesPerDay: SeriesPoint[];
  usageDaily: UsagePoint[];
  newPlayersPerDay: SeriesPoint[];
  topPlayers: TopPlayer[];
  totals: { newMembers: number; matches: number; aiQuestions: number };
}

const DAYS_OPTIONS = [7, 30, 90] as const;

const TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    color: '#f1f5f9',
  },
  labelStyle: { color: '#f1f5f9' },
  itemStyle: { color: '#f1f5f9' },
};

const AXIS_TICK = { fill: '#64748b', fontSize: 11 };

function isAllZero(values: number[]): boolean {
  return values.length === 0 || values.every((v) => !v);
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <div className="text-3xl font-bold text-cyan-300">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{label}</div>
    </div>
  );
}

function ChartCard({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  empty: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div dir="ltr" className="mt-3">
        {empty ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">{t('stats.empty')}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function StatsTab({ guildId }: { guildId: string }) {
  const { t, lang } = useI18n();
  const [days, setDays] = useState<(typeof DAYS_OPTIONS)[number]>(30);
  const stats = useQuery({
    queryKey: ['stats', guildId, days],
    queryFn: () => api<StatsResp>(`/api/guilds/${guildId}/stats?days=${days}`),
  });

  if (stats.isLoading) return <p className="text-slate-400">{t('loading')}</p>;

  const data = stats.data;
  const memberSeries = data?.memberSeries ?? [];
  const matchesSeries = data?.matchesPerDay ?? [];
  const usageSeries = data?.usageDaily ?? [];
  const topPlayers = data?.topPlayers ?? [];
  const listenMinutesSeries = usageSeries.map((d) => ({ date: d.date, minutes: Math.round(d.listen_seconds / 60) }));
  const joinedRecent = data?.joinedRecent ?? [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {DAYS_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              days === d
                ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 text-slate-950 shadow-[0_0_20px_-6px_rgba(99,102,241,0.7)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {t(`stats.days.${d}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label={t('stats.members')} value={data?.memberCount ?? '—'} />
        <StatTile label={t('stats.newMembers')} value={data?.totals.newMembers ?? 0} />
        <StatTile label={t('stats.matches')} value={data?.totals.matches ?? 0} />
        <StatTile label={t('stats.aiQuestions')} value={data?.totals.aiQuestions ?? 0} />
      </div>

      <ChartCard
        title={t('stats.memberGrowth')}
        hint={data?.memberSeriesSource === 'joined_fallback' ? t('stats.fallbackHint') : undefined}
        empty={isAllZero(memberSeries.map((d) => d.member_count ?? 0))}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={memberSeries}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Line type="monotone" dataKey="member_count" stroke="#0891b2" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('stats.matchesPerDay')} empty={isAllZero(matchesSeries.map((d) => d.count ?? 0))}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={matchesSeries} barCategoryGap={4}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard title={t('stats.aiPerDay')} empty={isAllZero(usageSeries.map((d) => d.ai_questions))}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={usageSeries} barCategoryGap={4}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_PROPS} />
              <Bar dataKey="ai_questions" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={t('stats.listenPerDay')} empty={isAllZero(listenMinutesSeries.map((d) => d.minutes))}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={listenMinutesSeries} barCategoryGap={4}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_PROPS} />
              <Bar dataKey="minutes" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title={t('stats.topPlayers')} empty={topPlayers.length === 0}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={topPlayers} layout="vertical">
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="user_id"
              width={90}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar dataKey="points" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 font-semibold">{t('stats.recentJoins')}</h3>
        {joinedRecent.length === 0 && <p className="text-slate-400">{t('stats.empty')}</p>}
        <div className="grid gap-3">
          {joinedRecent.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              {m.avatar ? (
                <img
                  src={`https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=64`}
                  alt=""
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-xs font-bold text-slate-950">
                  {m.username.slice(0, 1)}
                </div>
              )}
              <span className="font-semibold">{m.username}</span>
              <span className="ms-auto text-sm text-slate-400">
                {new Date(m.joined_at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
