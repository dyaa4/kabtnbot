import { Gem, Volume2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { VoiceLogSkeleton } from './Skeleton.js';

interface VoiceLogEntry {
  user_id: string;
  name: string;
  channel_id: string;
  channel_name: string;
  joined_at: string;
  left_at: string | null;
  seconds: number;
}

interface VoiceLogResp {
  active: VoiceLogEntry[];
  sessions: VoiceLogEntry[];
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function VoiceLogTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const log = useQuery({
    queryKey: ['voice-log', guildId],
    queryFn: () => api<VoiceLogResp>(`/api/guilds/${guildId}/voice-log`),
    refetchInterval: 30_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  if (log.isLoading) return <VoiceLogSkeleton />;

  if (log.error instanceof ApiError && log.error.code === 'PREMIUM_REQUIRED') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/5 p-12 text-center backdrop-blur-md">
        <Gem className="h-10 w-10 text-blue-300" />
        <h3 className="text-lg font-semibold text-blue-200">{t('voicelog.premium.title')}</h3>
        <p className="max-w-md text-sm text-slate-400">{t('voicelog.premium.body')}</p>
      </div>
    );
  }

  if (!log.data) return <p className="text-slate-400">{t('error.generic')}</p>;

  return (
    <div className="grid gap-8">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-1 text-lg font-semibold">{t('voicelog.activeNow')}</h3>
        <p className="mb-4 text-xs text-slate-500">{t('voicelog.hint')}</p>
        {log.data.active.length === 0 ? (
          <p className="text-sm text-slate-500">{t('voicelog.nobodyActive')}</p>
        ) : (
          <ul className="grid gap-2">
            {log.data.active.map((s) => (
              <li key={`${s.user_id}-${s.joined_at}`} className="flex items-center gap-3 text-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                <span className="font-semibold text-slate-200">{s.name}</span>
                <span className="flex items-center gap-1 text-slate-400"><Volume2 className="h-3.5 w-3.5" /> {s.channel_name}</span>
                <span className="ms-auto text-slate-400" dir="ltr">
                  {formatDuration(s.seconds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('voicelog.recent')}</h3>
        {log.data.sessions.length === 0 ? (
          <p className="text-sm text-slate-500">{t('voicelog.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-slate-500">
                  <th className="pb-2 text-start">{t('voicelog.member')}</th>
                  <th className="pb-2 text-start">{t('voicelog.channel')}</th>
                  <th className="pb-2 text-start">{t('voicelog.joined')}</th>
                  <th className="pb-2 text-start">{t('voicelog.duration')}</th>
                </tr>
              </thead>
              <tbody>
                {log.data.sessions.map((s) => (
                  <tr key={`${s.user_id}-${s.joined_at}`} className="border-t border-white/5 text-slate-300">
                    <td className="py-2 font-semibold">{s.name}</td>
                    <td className="py-2"><span className="flex items-center gap-1"><Volume2 className="h-3.5 w-3.5 text-slate-400" /> {s.channel_name}</span></td>
                    <td className="py-2 text-slate-400" dir="ltr">
                      {timeOf(s.joined_at)}
                    </td>
                    <td className="py-2 text-slate-400" dir="ltr">
                      {s.left_at === null ? '—' : formatDuration(s.seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
