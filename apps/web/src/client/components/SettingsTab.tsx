import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIALECTS, LANGUAGES } from '@gamebot/shared';
import { api, ApiError } from '../api.js';
import { useI18n, LANG_NAMES } from '../i18n.js';
import { BotProfileCard } from './BotProfileCard.js';
import { ChannelSelect } from './ChannelSelect.js';
import { RoleSelect } from './RoleSelect.js';
import { SaveBar } from './SaveBar.js';
import { useToast } from './Toast.js';

const VoiceForm = z.object({
  enabled: z.boolean(),
  wake_word: z.string().min(2).max(30),
  dialect: z.enum(DIALECTS),
  personality_enabled: z.boolean(),
});

type VoiceValues = z.infer<typeof VoiceForm>;

interface GuildConfigResp {
  admin_role_id: string | null;
  language: (typeof LANGUAGES)[number];
  voice: {
    enabled: boolean;
    wake_word: string;
    dialect: (typeof DIALECTS)[number];
    allowed_channel_ids: string[];
    personality_enabled: boolean;
  };
  summary?: {
    enabled: boolean;
    channel_id: string | null;
  };
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
}

export function SettingsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const cfg = useQuery({ queryKey: ['config', guildId], queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`) });

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

  const voice = useForm<VoiceValues>({ resolver: zodResolver(VoiceForm) });
  const [botLanguage, setBotLanguage] = useState<(typeof LANGUAGES)[number]>('ar');
  const [adminRoleId, setAdminRoleId] = useState('');
  const [allowedVoiceIds, setAllowedVoiceIds] = useState<string[]>([]);
  const [summaryEnabled, setSummaryEnabled] = useState(false);
  const [summaryChannelId, setSummaryChannelId] = useState('');

  const voiceChannels = useQuery({
    queryKey: ['voice-channels', guildId],
    queryFn: () => api<{ id: string; name: string }[]>(`/api/guilds/${guildId}/voice-channels`),
  });

  useEffect(() => {
    if (cfg.data) {
      voice.reset(cfg.data.voice);
      setBotLanguage(cfg.data.language ?? 'ar');
      setAdminRoleId(cfg.data.admin_role_id ?? '');
      setAllowedVoiceIds(cfg.data.voice.allowed_channel_ids);
      setSummaryEnabled(cfg.data.summary?.enabled ?? false);
      setSummaryChannelId(cfg.data.summary?.channel_id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  const toggleVoiceChannel = (id: string) => {
    setAllowedVoiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (cfg.isLoading) return <p className="text-slate-400">{t('loading')}</p>;

  const base = cfg.data;
  const dirty =
    voice.formState.isDirty ||
    (base !== undefined &&
      (!sameIds(allowedVoiceIds, base.voice.allowed_channel_ids) ||
        botLanguage !== (base.language ?? 'ar') ||
        adminRoleId !== (base.admin_role_id ?? '') ||
        summaryEnabled !== (base.summary?.enabled ?? false) ||
        summaryChannelId !== (base.summary?.channel_id ?? '')));

  // One combined PATCH for every section — voice validation gates the save.
  const onSave = voice.handleSubmit((v) => {
    patch.mutate({
      voice: { ...v, allowed_channel_ids: allowedVoiceIds },
      language: botLanguage,
      admin_role_id: adminRoleId === '' ? null : adminRoleId,
      summary: { enabled: summaryEnabled, channel_id: summaryChannelId === '' ? null : summaryChannelId },
    });
  });

  const voiceError = Object.values(voice.formState.errors)[0]?.message as string | undefined;

  return (
    <div className="grid gap-8">
      <form className="grid gap-8" onSubmit={onSave}>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <h3 className="mb-4 text-lg font-semibold">{t('settings.voice')}</h3>
          <label className="mb-1 flex items-center gap-2">
            <input type="checkbox" {...voice.register('enabled')} />
            <span>{t('settings.voice.enabled')}</span>
          </label>
          <p className="mb-3 ms-6 text-xs text-slate-500">{t('settings.voice.enabled.hint')}</p>
          <label className="mb-1 block">
            <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.wakeWord')}</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
              {...voice.register('wake_word')}
            />
          </label>
          <p className="mb-3 text-xs text-slate-500">{t('settings.voice.wakeWord.hint')}</p>
          <label className="mb-1 block">
            <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.dialect')}</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
              {...voice.register('dialect')}
            >
              {DIALECTS.map((d) => (
                <option key={d} value={d}>
                  {t(`settings.dialect.${d}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="mb-4 text-xs text-slate-500">{t('settings.voice.dialect.hint')}</p>
          <label className="mb-1 flex items-center gap-2">
            <input type="checkbox" {...voice.register('personality_enabled')} />
            <span>{t('settings.personality')}</span>
          </label>
          <p className="mb-4 ms-6 text-xs text-slate-500">{t('settings.personality.hint')}</p>

          <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.allowedChannels')}</span>
          <div className="mb-1 grid gap-1 rounded-xl border border-white/10 bg-slate-950/40 p-3">
            {voiceChannels.data?.length === 0 && <span className="text-xs text-slate-500">{t('settings.voice.noVoiceChannels')}</span>}
            {voiceChannels.data?.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowedVoiceIds.includes(c.id)}
                  onChange={() => toggleVoiceChannel(c.id)}
                />
                <span>🔊 {c.name}</span>
              </label>
            ))}
          </div>
          <p className="mb-2 text-xs text-slate-500">{t('settings.voice.allowedChannels.hint')}</p>
          <p data-testid="voice-error" className="text-sm text-red-400">
            {voiceError ?? ''}
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <h3 className="mb-4 text-lg font-semibold">{t('settings.language')}</h3>
          <label className="mb-1 block">
            <span className="mb-1 block text-sm text-slate-400">{t('settings.language')}</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
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

      <BotProfileCard guildId={guildId} />
    </div>
  );
}
