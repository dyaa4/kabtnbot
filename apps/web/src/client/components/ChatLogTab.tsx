import { Gem, TriangleAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { VoiceLogSkeleton } from './Skeleton.js';

interface ChatLogEntry {
  user_id: string;
  name: string;
  channel_id: string;
  channel_name: string;
  content: string;
  created_at: string;
}

interface ChatLogResp {
  /** False = the bot service runs without ENABLE_CHAT_LOG — nothing records. */
  recording?: boolean;
  messages: ChatLogEntry[];
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ChatLogTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const log = useQuery({
    queryKey: ['chat-log', guildId],
    queryFn: () => api<ChatLogResp>(`/api/guilds/${guildId}/chat-log`),
    refetchInterval: 30_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  if (log.isLoading) return <VoiceLogSkeleton />;

  if (log.error instanceof ApiError && log.error.code === 'PREMIUM_REQUIRED') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/5 p-12 text-center backdrop-blur-md">
        <Gem className="h-10 w-10 text-blue-300" />
        <h3 className="text-lg font-semibold text-blue-200">{t('chatlog.premium.title')}</h3>
        <p className="max-w-md text-sm text-slate-400">{t('chatlog.premium.body')}</p>
      </div>
    );
  }

  if (!log.data) return <p className="text-slate-400">{t('error.generic')}</p>;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <h3 className="mb-1 text-lg font-semibold">{t('chatlog.title')}</h3>
      <p className="mb-4 text-xs text-slate-500">{t('chatlog.hint')}</p>
      {log.data.recording === false ? (
        <div className="flex items-start gap-3 rounded-xl border border-blue-400/30 bg-blue-400/5 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <div>
            <p className="text-sm font-semibold text-blue-200">{t('chatlog.disabled.title')}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{t('chatlog.disabled.body')}</p>
          </div>
        </div>
      ) : log.data.messages.length === 0 ? (
        <p className="text-sm text-slate-500">{t('chatlog.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="pb-2 text-start">{t('chatlog.member')}</th>
                <th className="pb-2 text-start">{t('chatlog.channel')}</th>
                <th className="pb-2 text-start">{t('chatlog.message')}</th>
                <th className="pb-2 text-start">{t('chatlog.time')}</th>
              </tr>
            </thead>
            <tbody>
              {log.data.messages.map((m) => (
                <tr key={`${m.user_id}-${m.created_at}`} className="border-t border-white/5 align-top text-slate-300">
                  <td className="py-2 font-semibold">{m.name}</td>
                  <td className="py-2 whitespace-nowrap">#{m.channel_name}</td>
                  <td className="max-w-md break-words py-2 text-slate-400">{m.content}</td>
                  <td className="py-2 whitespace-nowrap text-slate-500" dir="ltr">
                    {timeOf(m.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
