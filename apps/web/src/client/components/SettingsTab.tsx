import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIALECTS } from '@gamebot/shared';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

const VoiceForm = z.object({
  enabled: z.boolean(),
  wake_word: z.string().min(2).max(30),
  dialect: z.enum(DIALECTS),
});
const CustomsForm = z.object({
  win_points: z.coerce.number().int().min(-1000).max(1000),
  loss_points: z.coerce.number().int().min(-1000).max(1000),
  admin_role_id: z
    .string()
    .trim()
    .transform((s) => (s === '' ? null : s))
    .nullable(),
});

type VoiceValues = z.infer<typeof VoiceForm>;
type CustomsValues = z.input<typeof CustomsForm>;

interface GuildConfigResp {
  voice: { enabled: boolean; wake_word: string; dialect: (typeof DIALECTS)[number]; allowed_channel_ids: string[] };
  customs: { win_points: number; loss_points: number; admin_role_id: string | null };
}

export function SettingsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const cfg = useQuery({ queryKey: ['config', guildId], queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`) });

  const patch = useMutation({
    mutationFn: (body: object) => api(`/api/guilds/${guildId}/config`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      void qc.invalidateQueries({ queryKey: ['config', guildId] });
    },
  });

  const voice = useForm<VoiceValues>({ resolver: zodResolver(VoiceForm) });
  const customs = useForm<CustomsValues>({ resolver: zodResolver(CustomsForm) });

  useEffect(() => {
    if (cfg.data) {
      voice.reset(cfg.data.voice);
      customs.reset({ ...cfg.data.customs, admin_role_id: cfg.data.customs.admin_role_id ?? '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  if (cfg.isLoading) return <p className="text-slate-400">{t('loading')}</p>;

  const voiceError = Object.values(voice.formState.errors)[0]?.message as string | undefined;
  const customsError = Object.values(customs.formState.errors)[0]?.message as string | undefined;

  return (
    <div className="grid gap-8">
      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/30 px-4 py-2 text-emerald-300 backdrop-blur-md">
          {t('settings.saved')}
        </div>
      )}

      <form
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        onSubmit={voice.handleSubmit((v) => patch.mutate({ voice: v }))}
      >
        <h3 className="mb-4 text-lg font-semibold">{t('settings.voice')}</h3>
        <label className="mb-3 flex items-center gap-2">
          <input type="checkbox" {...voice.register('enabled')} />
          <span>{t('settings.voice.enabled')}</span>
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.wakeWord')}</span>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            {...voice.register('wake_word')}
          />
        </label>
        <label className="mb-4 block">
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
        <p data-testid="voice-error" className="mb-2 text-sm text-red-400">
          {voiceError ?? ''}
        </p>
        <button
          className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-4 py-2 font-semibold text-slate-950 shadow-[0_0_20px_-6px_rgba(99,102,241,0.7)] transition hover:scale-[1.02] hover:shadow-[0_0_26px_-4px_rgba(34,211,238,0.8)]"
          type="submit"
        >
          {t('settings.save')}
        </button>
      </form>

      <form
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        onSubmit={customs.handleSubmit((v) => patch.mutate({ customs: CustomsForm.parse(v) }))}
      >
        <h3 className="mb-4 text-lg font-semibold">{t('settings.customs')}</h3>
        <div className="mb-3 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">{t('settings.customs.winPoints')}</span>
            <input
              type="number"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
              {...customs.register('win_points')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">{t('settings.customs.lossPoints')}</span>
            <input
              type="number"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
              {...customs.register('loss_points')}
            />
          </label>
        </div>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-400">{t('settings.customs.adminRole')}</span>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            {...customs.register('admin_role_id')}
          />
        </label>
        <p data-testid="customs-error" className="mb-2 text-sm text-red-400">
          {customsError ?? ''}
        </p>
        <button
          className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-4 py-2 font-semibold text-slate-950 shadow-[0_0_20px_-6px_rgba(99,102,241,0.7)] transition hover:scale-[1.02] hover:shadow-[0_0_26px_-4px_rgba(34,211,238,0.8)]"
          type="submit"
        >
          {t('settings.save')}
        </button>
      </form>
    </div>
  );
}
