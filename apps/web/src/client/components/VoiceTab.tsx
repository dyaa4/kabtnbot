import { Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIALECTS } from '@gamebot/shared';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { usePremiumStatus } from '../premium.js';
import { PremiumUpsell } from './PremiumUpsell.js';
import { SaveBar } from './SaveBar.js';
import { FormSkeleton } from './Skeleton.js';
import { useToast } from './Toast.js';

const FOLLOW_UP_CHOICES = [0, 15, 30, 60] as const;

const VoiceForm = z.object({
  enabled: z.boolean(),
  wake_word: z.string().min(2).max(30),
  dialect: z.enum(DIALECTS),
  personality_enabled: z.boolean(),
  follow_up_seconds: z.number().int().min(0).max(120),
  focus_active_speaker: z.boolean(),
});

type VoiceValues = z.infer<typeof VoiceForm>;

interface GuildConfigResp {
  language: string;
  voice: {
    enabled: boolean;
    wake_word: string;
    dialect: (typeof DIALECTS)[number];
    allowed_channel_ids: string[];
    personality_enabled: boolean;
    follow_up_seconds: number;
    focus_active_speaker: boolean;
  };
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
}

/** Voice assistant settings — premium: the PATCH is server-gated, this tab
 * shows the upsell panel instead of a form that could never save. */
export function VoiceTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { loading: premiumLoading, voicePremium } = usePremiumStatus(guildId);
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

  const voice = useForm<VoiceValues>({ resolver: zodResolver(VoiceForm) });
  const [allowedVoiceIds, setAllowedVoiceIds] = useState<string[]>([]);

  const voiceChannels = useQuery({
    queryKey: ['voice-channels', guildId],
    queryFn: () => api<{ id: string; name: string }[]>(`/api/guilds/${guildId}/voice-channels`),
  });

  useEffect(() => {
    if (cfg.data) {
      voice.reset(cfg.data.voice);
      setAllowedVoiceIds(cfg.data.voice.allowed_channel_ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  const toggleVoiceChannel = (id: string) => {
    setAllowedVoiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (premiumLoading || cfg.isLoading) return <FormSkeleton sections={2} />;
  if (!voicePremium) {
    return <PremiumUpsell title={t('voicetab.premium.title')} body={t('voicetab.premium.body')} />;
  }

  const base = cfg.data;
  const dirty =
    voice.formState.isDirty ||
    (base !== undefined && !sameIds(allowedVoiceIds, base.voice.allowed_channel_ids));

  const onSave = voice.handleSubmit((v) => {
    patch.mutate({ voice: { ...v, allowed_channel_ids: allowedVoiceIds } });
  });

  const voiceError = Object.values(voice.formState.errors)[0]?.message as string | undefined;

  return (
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
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
            {...voice.register('wake_word')}
          />
        </label>
        <p className="mb-3 text-xs text-slate-500">{t('settings.voice.wakeWord.hint')}</p>
        {base?.language === 'ar' && (
          <>
            <label className="mb-1 block">
              <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.dialect')}</span>
              <select
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
                {...voice.register('dialect')}
              >
                {DIALECTS.map((d) => (
                  <option key={d} value={d}>
                    {t(`settings.voice.dialect.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mb-4 text-xs text-slate-500">{t('settings.voice.dialect.hint')}</p>
          </>
        )}
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.followUp')}</span>
          <select
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
            {...voice.register('follow_up_seconds', { valueAsNumber: true })}
          >
            {FOLLOW_UP_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? t('settings.voice.followUp.off') : `${s}s`}
              </option>
            ))}
          </select>
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('settings.voice.followUp.hint')}</p>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...voice.register('focus_active_speaker')} />
          <span>{t('settings.voice.focus')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('settings.voice.focus.hint')}</p>
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
              <span className="flex items-center gap-1"><Volume2 className="h-3.5 w-3.5 text-slate-400" /> {c.name}</span>
            </label>
          ))}
        </div>
        <p className="mb-2 text-xs text-slate-500">{t('settings.voice.allowedChannels.hint')}</p>
        <p data-testid="voice-error" className="text-sm text-red-400">
          {voiceError ?? ''}
        </p>
      </section>

      <SaveBar dirty={dirty} saving={patch.isPending} />
    </form>
  );
}
