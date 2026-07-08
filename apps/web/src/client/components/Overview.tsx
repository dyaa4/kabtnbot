import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { GettingStarted } from './GettingStarted.js';

interface Usage {
  listen_seconds: number;
  ai_questions: number;
  limits: { listen_minutes_per_day: number; ai_questions_per_day: number };
  premium_active: boolean;
}

interface ServerInfo {
  name: string;
  icon: string | null;
  memberCount: number | null;
  onlineCount: number | null;
  boostTier: number;
  boostCount: number;
  createdAt: string | null;
}

function Bar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-sm text-slate-300">
        <span>{label}</span>
        <span>
          {used} / {max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-bold text-cyan-300">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
    </div>
  );
}

function ServerInfoCard({ guildId }: { guildId: string }) {
  const { t, lang } = useI18n();
  const info = useQuery({ queryKey: ['guild-info', guildId], queryFn: () => api<ServerInfo>(`/api/guilds/${guildId}/info`) });
  if (!info.data) return null;
  const s = info.data;

  const locale = lang === 'ar' ? 'ar' : 'en-GB';
  const num = (n: number | null) => (n === null ? '—' : n.toLocaleString(locale));
  const created = s.createdAt
    ? new Date(s.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <div className="mb-5 flex items-center gap-4">
        {s.icon ? (
          <img
            src={`https://cdn.discordapp.com/icons/${guildId}/${s.icon}.png?size=64`}
            alt=""
            className="h-14 w-14 rounded-2xl"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-2xl font-bold text-slate-950">
            {s.name.slice(0, 1)}
          </div>
        )}
        <h2 className="text-xl font-bold">{s.name}</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <InfoStat label={t('stats.members')} value={num(s.memberCount)} />
        <InfoStat label={t('overview.online')} value={num(s.onlineCount)} />
        <InfoStat label={t('overview.created')} value={created} />
        <InfoStat
          label={t('overview.boostLevel')}
          value={s.boostTier > 0 ? `${s.boostTier} · ${s.boostCount}` : '—'}
        />
      </div>
    </div>
  );
}

export function Overview({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const usage = useQuery({ queryKey: ['usage', guildId], queryFn: () => api<Usage>(`/api/guilds/${guildId}/usage`) });

  return (
    <div>
      <ServerInfoCard guildId={guildId} />
      <GettingStarted guildId={guildId} />
      {usage.data && (
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <Bar label={t('overview.listen')} used={Math.round(usage.data.listen_seconds / 60)} max={usage.data.limits.listen_minutes_per_day} />
          <Bar label={t('overview.ai')} used={usage.data.ai_questions} max={usage.data.limits.ai_questions_per_day} />
        </div>
      )}
    </div>
  );
}
