import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface Match {
  _id: string;
  game: string;
  status: 'completed' | 'cancelled' | 'lobby' | 'in_progress';
  winner: 'a' | 'b' | null;
  team_a: string[];
  team_b: string[];
  completed_at: string | null;
}
interface MatchesResp {
  active: Match | null;
  recent: Match[];
}

export function MatchesTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const matches = useQuery({ queryKey: ['matches', guildId], queryFn: () => api<MatchesResp>(`/api/guilds/${guildId}/matches`) });

  if (matches.isLoading) return <p className="text-slate-400">{t('loading')}</p>;

  const outcome = (m: Match): string =>
    m.status === 'cancelled' ? t('matches.cancelled') : m.winner === 'a' ? t('matches.winner.a') : t('matches.winner.b');

  return (
    <div>
      <h3 className="mb-3 font-semibold">{t('matches.recent')}</h3>
      {!matches.data?.recent.length && <p className="text-slate-400">{t('matches.empty')}</p>}
      <div className="grid gap-3">
        {matches.data?.recent.map((m) => (
          <div
            key={m._id}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-cyan-400/30"
          >
            <div>
              <span className="font-semibold">{m.game}</span>
              <span className="ms-3 text-sm text-slate-400">
                {m.team_a.length}v{m.team_b.length}
              </span>
            </div>
            <span className={`text-sm font-semibold ${m.status === 'cancelled' ? 'text-slate-500' : 'text-emerald-400'}`}>
              {outcome(m)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
