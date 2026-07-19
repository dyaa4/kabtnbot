import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LANGUAGES } from '@gamebot/shared';
import { api, ApiError } from '../api.js';
import { useI18n, LANG_NAMES } from '../i18n.js';
import { ChannelSelect } from './ChannelSelect.js';
import { RoleSelect } from './RoleSelect.js';
import { SaveBar } from './SaveBar.js';
import { FormSkeleton } from './Skeleton.js';
import { useToast } from './Toast.js';

interface GuildConfigResp {
  admin_role_id: string | null;
  language: (typeof LANGUAGES)[number];
  summary?: {
    enabled: boolean;
    channel_id: string | null;
  };
}

/** General settings: bot language, admin role, weekly summary. The voice
 * assistant moved to its own (premium) tab, bot profile to Customize. */
export function SettingsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  // No focus-refetch: the form resets from cfg.data, so a refetch while the
  // admin is mid-edit would silently wipe their edits.
  const cfg = useQuery({
    queryKey: ['config', guildId],
    queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`),
    refetchOnWindowFocus: false,
  });

  const patch = useMutation({
    mutationFn: (body: object) => api(`/api/guilds/${guildId}/config`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(t('settings.saved'));
      void qc.invalidateQueries({ queryKey: ['config', guildId] });
    },
    onError: (err) => {
      const detail = err instanceof ApiError && err.message ? ` (${err.message})` : '';
      toast.error(`${t('error.generic')}${detail}`);
    },
  });

  const [botLanguage, setBotLanguage] = useState<(typeof LANGUAGES)[number]>('ar');
  const [adminRoleId, setAdminRoleId] = useState('');
  const [summaryEnabled, setSummaryEnabled] = useState(false);
  const [summaryChannelId, setSummaryChannelId] = useState('');

  useEffect(() => {
    if (cfg.data) {
      setBotLanguage(cfg.data.language ?? 'ar');
      setAdminRoleId(cfg.data.admin_role_id ?? '');
      setSummaryEnabled(cfg.data.summary?.enabled ?? false);
      setSummaryChannelId(cfg.data.summary?.channel_id ?? '');
    }
  }, [cfg.data]);

  if (cfg.isLoading) return <FormSkeleton sections={3} />;

  const base = cfg.data;
  const dirty =
    base !== undefined &&
    (botLanguage !== (base.language ?? 'ar') ||
      adminRoleId !== (base.admin_role_id ?? '') ||
      summaryEnabled !== (base.summary?.enabled ?? false) ||
      summaryChannelId !== (base.summary?.channel_id ?? ''));

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    patch.mutate({
      language: botLanguage,
      admin_role_id: adminRoleId === '' ? null : adminRoleId,
      summary: { enabled: summaryEnabled, channel_id: summaryChannelId === '' ? null : summaryChannelId },
    });
  };

  return (
    <form className="grid gap-8" onSubmit={onSave}>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('settings.language')}</h3>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('settings.language')}</span>
          <select
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
            value={botLanguage}
            onChange={(e) => setBotLanguage(e.target.value as (typeof LANGUAGES)[number])}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANG_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">{t('settings.language.hint')}</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('settings.adminRole')}</h3>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('settings.adminRole')}</span>
          <RoleSelect guildId={guildId} value={adminRoleId} onChange={setAdminRoleId} />
        </label>
        <p className="text-xs text-slate-500">{t('settings.adminRole.hint')}</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('summary.title')}</h3>
        <label className="mb-1 flex items-center gap-2">
          <input
            type="checkbox"
            checked={summaryEnabled}
            onChange={(e) => setSummaryEnabled(e.target.checked)}
          />
          <span>{t('summary.enabled')}</span>
        </label>
        <p className="mb-3 ms-6 text-xs text-slate-500">{t('summary.enabled.hint')}</p>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('summary.channelId')}</span>
          <ChannelSelect guildId={guildId} value={summaryChannelId} onChange={setSummaryChannelId} />
        </label>
        <p className="text-xs text-slate-500">{t('summary.channelId.hint')}</p>
      </section>

      <SaveBar dirty={dirty} saving={patch.isPending} />
    </form>
  );
}
