import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface Usage {
  listen_seconds: number;
  ai_questions: number;
  limits: { listen_minutes_per_day: number; ai_questions_per_day: number };
  premium_active: boolean;
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

export function Overview({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const usage = useQuery({ queryKey: ['usage', guildId], queryFn: () => api<Usage>(`/api/guilds/${guildId}/usage`) });

  return (
    <div>
      {usage.data && (
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <Bar label={t('overview.listen')} used={Math.round(usage.data.listen_seconds / 60)} max={usage.data.limits.listen_minutes_per_day} />
          <Bar label={t('overview.ai')} used={usage.data.ai_questions} max={usage.data.limits.ai_questions_per_day} />
        </div>
      )}
    </div>
  );
}
