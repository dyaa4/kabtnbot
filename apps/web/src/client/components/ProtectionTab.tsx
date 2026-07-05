import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const ProtectionForm = z.object({
  enabled: z.boolean(),
  voice_moderation: z.boolean(),
  text_protection: z.boolean(),
  custom_words: z.string(),
  allowed_domains: z.string(),
  log_channel_id: z.string(),
});

type ProtectionValues = z.infer<typeof ProtectionForm>;

interface GuildConfigResp {
  protection: {
    enabled: boolean;
    voice_moderation: boolean;
    text_protection: boolean;
    custom_words: string[];
    allowed_domains: string[];
    log_channel_id: string | null;
  };
}

export function ProtectionTab({ guildId }: { guildId: string }) {
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

  const form = useForm<ProtectionValues>({ resolver: zodResolver(ProtectionForm) });

  useEffect(() => {
    if (cfg.data) {
      form.reset({
        enabled: cfg.data.protection.enabled,
        voice_moderation: cfg.data.protection.voice_moderation,
        text_protection: cfg.data.protection.text_protection,
        custom_words: cfg.data.protection.custom_words.join('\n'),
        allowed_domains: cfg.data.protection.allowed_domains.join('\n'),
        log_channel_id: cfg.data.protection.log_channel_id ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  if (cfg.isLoading) return <p className="text-slate-400">{t('loading')}</p>;

  const onSubmit = (v: ProtectionValues) => {
    const logChannelId = v.log_channel_id.trim();
    patch.mutate({
      protection: {
        enabled: v.enabled,
        voice_moderation: v.voice_moderation,
        text_protection: v.text_protection,
        custom_words: splitList(v.custom_words),
        allowed_domains: splitList(v.allowed_domains),
        log_channel_id: logChannelId === '' ? null : logChannelId,
      },
    });
  };

  return (
    <div className="grid gap-8">
      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/30 px-4 py-2 text-emerald-300 backdrop-blur-md">
          {t('settings.saved')}
        </div>
      )}

      <form
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <h3 className="mb-4 text-lg font-semibold">{t('protection.title')}</h3>
        <label className="mb-3 flex items-center gap-2">
          <input type="checkbox" {...form.register('enabled')} />
          <span>{t('protection.enabled')}</span>
        </label>
        <label className="mb-3 flex items-center gap-2">
          <input type="checkbox" {...form.register('voice_moderation')} />
          <span>{t('protection.voiceModeration')}</span>
        </label>
        <label className="mb-4 flex items-center gap-2">
          <input type="checkbox" {...form.register('text_protection')} />
          <span>{t('protection.textProtection')}</span>
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-400">{t('protection.customWords')}</span>
          <textarea
            className="h-28 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            {...form.register('custom_words')}
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-400">{t('protection.allowedDomains')}</span>
          <textarea
            className="h-28 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            {...form.register('allowed_domains')}
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-400">{t('protection.logChannelId')}</span>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            {...form.register('log_channel_id')}
          />
        </label>
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
