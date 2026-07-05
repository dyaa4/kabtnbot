import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface Usage {
  listen_seconds: number;
  ai_questions: number;
  limits: { listen_minutes_per_day: number; ai_questions_per_day: number };
  premium_active: boolean;
}
interface MatchesResp {
  active: { _id: string; game: string; players: string[]; status: string } | null;
  recent: unknown[];
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
      <div className="h-2 rounded bg-slate-800">
        <div className="h-2 rounded bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Overview({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const usage = useQuery({ queryKey: ['usage', guildId], queryFn: () => api<Usage>(`/api/guilds/${guildId}/usage`) });
  const matches = useQuery({ queryKey: ['matches', guildId], queryFn: () => api<MatchesResp>(`/api/guilds/${guildId}/matches`) });
  const cancel = useMutation({
    mutationFn: (matchId: string) => api(`/api/guilds/${guildId}/matches/${matchId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['matches', guildId] });
      void qc.invalidateQueries({ queryKey: ['usage', guildId] });
    },
  });

  return (
    <div>
      {usage.data && (
        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <Bar label={t('overview.listen')} used={Math.round(usage.data.listen_seconds / 60)} max={usage.data.limits.listen_minutes_per_day} />
          <Bar label={t('overview.ai')} used={usage.data.ai_questions} max={usage.data.limits.ai_questions_per_day} />
        </div>
      )}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="mb-3 font-semibold">{t('overview.activeMatch')}</h3>
        {matches.data?.active ? (
          <div className="flex items-center justify-between">
            <span>
              {matches.data.active.game} — {matches.data.active.players.length} 👤
            </span>
            <button
              className="rounded bg-red-600 px-3 py-1 text-sm font-semibold hover:bg-red-500 disabled:opacity-50"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(matches.data!.active!._id)}
            >
              {t('overview.cancelMatch')}
            </button>
          </div>
        ) : (
          <p className="text-slate-400">{t('overview.noActiveMatch')}</p>
        )}
      </div>
    </div>
  );
}
