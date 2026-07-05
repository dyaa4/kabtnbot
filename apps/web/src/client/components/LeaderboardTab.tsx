import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface Player {
  user_id: string;
  points: number;
  wins: number;
  losses: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const players = useQuery({ queryKey: ['leaderboard', guildId], queryFn: () => api<Player[]>(`/api/guilds/${guildId}/leaderboard`) });
  const adjust = useMutation({
    mutationFn: ({ userId, delta }: { userId: string; delta: number }) =>
      api(`/api/guilds/${guildId}/players/${userId}/adjust`, { method: 'POST', body: JSON.stringify({ delta }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['leaderboard', guildId] }),
  });

  if (players.isLoading) return <p className="text-slate-400">{t('loading')}</p>;
  if (!players.data?.length) return <p className="text-slate-400">{t('leaderboard.empty')}</p>;

  return (
    <table className="w-full rounded-xl border border-slate-800 bg-slate-900 text-sm">
      <thead>
        <tr className="border-b border-slate-800 text-start text-slate-400">
          <th className="p-3 text-start">#</th>
          <th className="p-3 text-start">ID</th>
          <th className="p-3 text-start">{t('leaderboard.points')}</th>
          <th className="p-3 text-start">{t('leaderboard.wl')}</th>
          <th className="p-3 text-start">{t('leaderboard.adjust')}</th>
        </tr>
      </thead>
      <tbody>
        {players.data.map((p, i) => (
          <tr key={p.user_id} className="border-b border-slate-800/50">
            <td className="p-3">{MEDALS[i] ?? i + 1}</td>
            <td className="p-3 font-mono text-xs">{p.user_id}</td>
            <td className="p-3 font-bold">{p.points}</td>
            <td className="p-3">
              {p.wins}/{p.losses}
            </td>
            <td className="p-3">
              <div className="flex items-center gap-2">
                <input
                  className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1"
                  placeholder={t('leaderboard.adjust.delta')}
                  value={deltas[p.user_id] ?? ''}
                  onChange={(e) => setDeltas({ ...deltas, [p.user_id]: e.target.value })}
                />
                <button
                  className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold hover:bg-slate-600 disabled:opacity-50"
                  disabled={adjust.isPending || !Number.isInteger(Number(deltas[p.user_id])) || Number(deltas[p.user_id]) === 0}
                  onClick={() => {
                    adjust.mutate({ userId: p.user_id, delta: Number(deltas[p.user_id]) });
                    setDeltas({ ...deltas, [p.user_id]: '' });
                  }}
                >
                  {t('leaderboard.adjust.apply')}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
