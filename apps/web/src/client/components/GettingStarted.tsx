import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface GuildConfigResp {
  admin_role_id: string | null;
  protection: { enabled: boolean };
  welcome: { enabled: boolean; channel_id: string | null; banner_url: string | null };
}

interface Step {
  key: string;
  done: boolean;
  to: string;
  optional?: boolean;
}

/**
 * Setup checklist shown on the Overview tab until the required steps are done,
 * so a freshly invited bot doesn't sit unconfigured. Derived live from the
 * guild config — no separate stored state.
 */
export function GettingStarted({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const cfg = useQuery({ queryKey: ['config', guildId], queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`) });
  const banner = useQuery({
    queryKey: ['banner', guildId],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`/api/guilds/${guildId}/assets/welcome-banner`, { credentials: 'same-origin' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`banner ${res.status}`);
      return URL.createObjectURL(await res.blob());
    },
  });

  if (!cfg.data || banner.isLoading) return null;

  const steps: Step[] = [
    { key: 'protection', done: cfg.data.protection.enabled, to: 'protection' },
    { key: 'welcome', done: cfg.data.welcome.enabled && cfg.data.welcome.channel_id !== null, to: 'welcome' },
    { key: 'banner', done: (banner.data ?? cfg.data.welcome.banner_url) !== null, to: 'welcome' },
    { key: 'adminRole', done: cfg.data.admin_role_id !== null, to: 'settings', optional: true },
  ];
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  if (doneCount === required.length) return null;

  return (
    <div className="mb-8 rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-6 backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('onboarding.title')}</h3>
        <span className="text-sm text-cyan-300">
          {doneCount}/{required.length}
        </span>
      </div>
      <p className="mb-4 text-sm text-slate-400">{t('onboarding.subtitle')}</p>
      <ul className="grid gap-2">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3 text-sm">
            <span className={step.done ? 'text-emerald-400' : 'text-slate-500'}>{step.done ? '✓' : '○'}</span>
            <span className={step.done ? 'text-slate-500 line-through' : 'text-slate-200'}>
              {t(`onboarding.step.${step.key}`)}
              {step.optional && <span className="ms-2 text-xs text-slate-500">{t('onboarding.optional')}</span>}
            </span>
            {!step.done && (
              <Link to={step.to} className="ms-auto text-xs font-semibold text-cyan-300 hover:underline">
                {t('onboarding.fix')}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
