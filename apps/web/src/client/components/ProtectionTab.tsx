import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { ChannelSelect } from './ChannelSelect.js';
import { SaveBar } from './SaveBar.js';
import { FormSkeleton } from './Skeleton.js';
import { useToast } from './Toast.js';

function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const ProtectionForm = z.object({
  enabled: z.boolean(),
  voice_moderation: z.boolean(),
  voice_kick_immediately: z.boolean(),
  text_protection: z.boolean(),
  text_timeout: z.boolean(),
  anti_spam: z.boolean(),
  custom_words: z.string(),
  blocked_domains: z.string(),
  log_channel_id: z.string(),
});

type ProtectionValues = z.infer<typeof ProtectionForm>;

interface GuildConfigResp {
  protection: {
    enabled: boolean;
    voice_moderation: boolean;
    voice_kick_immediately: boolean;
    text_protection: boolean;
    text_timeout: boolean;
    anti_spam: boolean;
    custom_words: string[];
    blocked_domains: string[];
    log_channel_id: string | null;
  };
}

export function ProtectionTab({ guildId }: { guildId: string }) {
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

  const form = useForm<ProtectionValues>({ resolver: zodResolver(ProtectionForm) });

  // The bot reports which text features it ACTUALLY runs with — without the
  // Message Content intent, text protection and anti-spam look enabled here
  // but silently receive empty message content and do nothing.
  const botStatus = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => api<{ features: { text_protection: boolean } | null }>('/api/status'),
    staleTime: 30_000,
  });
  const textDormant = botStatus.data?.features != null && !botStatus.data.features.text_protection;

  useEffect(() => {
    if (cfg.data) {
      form.reset({
        enabled: cfg.data.protection.enabled,
        voice_moderation: cfg.data.protection.voice_moderation,
        voice_kick_immediately: cfg.data.protection.voice_kick_immediately,
        text_protection: cfg.data.protection.text_protection,
        text_timeout: cfg.data.protection.text_timeout,
        anti_spam: cfg.data.protection.anti_spam,
        custom_words: cfg.data.protection.custom_words.join('\n'),
        blocked_domains: cfg.data.protection.blocked_domains.join('\n'),
        log_channel_id: cfg.data.protection.log_channel_id ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  if (cfg.isLoading) return <FormSkeleton sections={1} />;

  const onSubmit = (v: ProtectionValues) => {
    const logChannelId = v.log_channel_id.trim();
    patch.mutate({
      protection: {
        enabled: v.enabled,
        voice_moderation: v.voice_moderation,
        voice_kick_immediately: v.voice_kick_immediately,
        text_protection: v.text_protection,
        text_timeout: v.text_timeout,
        anti_spam: v.anti_spam,
        custom_words: splitList(v.custom_words),
        blocked_domains: splitList(v.blocked_domains),
        log_channel_id: logChannelId === '' ? null : logChannelId,
      },
    });
  };

  return (
    <div className="grid gap-8">
      <form
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <h3 className="mb-4 text-lg font-semibold">{t('protection.title')}</h3>
        {textDormant && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-400/30 bg-blue-400/5 p-4">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
            <div>
              <p className="text-sm font-semibold text-blue-200">{t('protection.dormant.title')}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{t('protection.dormant.body')}</p>
            </div>
          </div>
        )}
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...form.register('enabled')} />
          <span>{t('protection.enabled')}</span>
        </label>
        <p className="mb-3 ms-6 text-xs text-slate-500">{t('protection.enabled.hint')}</p>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...form.register('voice_moderation')} />
          <span>{t('protection.voiceModeration')}</span>
        </label>
        <p className="mb-3 ms-6 text-xs text-slate-500">{t('protection.voiceModeration.hint')}</p>
        <label className="mb-1 ms-6 flex items-center gap-2">
          <input type="checkbox" {...form.register('voice_kick_immediately')} />
          <span>{t('protection.voiceKickImmediate')}</span>
        </label>
        <p className="mb-3 ms-12 text-xs text-slate-500">{t('protection.voiceKickImmediate.hint')}</p>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...form.register('text_protection')} />
          <span>{t('protection.textProtection')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('protection.textProtection.hint')}</p>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...form.register('text_timeout')} />
          <span>{t('protection.textTimeout')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('protection.textTimeout.hint')}</p>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...form.register('anti_spam')} />
          <span>{t('protection.antiSpam')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('protection.antiSpam.hint')}</p>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('protection.customWords')}</span>
          <textarea
            className="h-28 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
            {...form.register('custom_words')}
          />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('protection.customWords.hint')}</p>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('protection.blockedDomains')}</span>
          <textarea
            className="h-28 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
            {...form.register('blocked_domains')}
          />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('protection.blockedDomains.hint')}</p>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('protection.logChannelId')}</span>
          <ChannelSelect
            guildId={guildId}
            value={form.watch('log_channel_id') ?? ''}
            onChange={(id) => form.setValue('log_channel_id', id, { shouldDirty: true })}
          />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('protection.logChannelId.hint')}</p>
        <SaveBar dirty={form.formState.isDirty} saving={patch.isPending} />
      </form>
    </div>
  );
}
