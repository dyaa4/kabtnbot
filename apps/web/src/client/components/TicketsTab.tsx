import { Ticket } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { SaveBar } from './SaveBar.js';
import { FormSkeleton } from './Skeleton.js';
import { useToast } from './Toast.js';

const TicketForm = z.object({
  enabled: z.boolean(),
  category_id: z.string().nullable(),
  support_role_id: z.string().nullable(),
  log_channel_id: z.string().nullable(),
  panel_channel_id: z.string().nullable(),
  welcome_message: z.string().max(2000),
  close_message: z.string().max(2000),
  auto_close_hours: z.number().int().min(0).max(168),
});

type TicketValues = z.infer<typeof TicketForm>;

interface GuildConfigResp {
  language: string;
  tickets: TicketValues;
}

interface TicketLogEntry {
  _id: string;
  guild_id: string;
  user_id: string;
  channel_id: string;
  status: 'open' | 'closed';
  reason: string;
  assigned_to: string | null;
  created_at: string;
  closed_at: string | null;
}

const AUTO_CLOSE_CHOICES = [0, 1, 3, 6, 12, 24, 48, 72, 168] as const;

export function TicketsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();

  const cfg = useQuery({
    queryKey: ['config', guildId],
    queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`),
    refetchOnWindowFocus: false,
  });

  const tickets = useQuery({
    queryKey: ['tickets', guildId],
    queryFn: () => api<TicketLogEntry[]>(`/api/guilds/${guildId}/tickets`),
    refetchOnWindowFocus: false,
  });

  const memberNames = useQuery({
    queryKey: ['memberNames', guildId, tickets.data],
    queryFn: () => {
      const ids = [...new Set(tickets.data!.map((t) => t.user_id))].join(',');
      return api<Record<string, string | null>>(`/api/guilds/${guildId}/members/names?ids=${ids}`);
    },
    enabled: !!tickets.data && tickets.data.length > 0,
    refetchOnWindowFocus: false,
  });

  const closeTicket = useMutation({
    mutationFn: (ticketId: string) => api(`/api/guilds/${guildId}/tickets/${ticketId}/close`, { method: 'PATCH' }),
    onSuccess: () => {
      toast.success(t('tickets.log.closedStatus'));
      void qc.invalidateQueries({ queryKey: ['tickets', guildId] });
    },
    onError: (err) => {
      const detail = err instanceof ApiError && err.message ? ` (${err.message})` : '';
      toast.error(`${t('error.generic')}${detail}`);
    },
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

  const form = useForm<TicketValues>({ resolver: zodResolver(TicketForm) });

  useEffect(() => {
    if (cfg.data) form.reset(cfg.data.tickets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  const categories = useQuery({
    queryKey: ['categories', guildId],
    queryFn: () => api<{ id: string; name: string }[]>(`/api/guilds/${guildId}/categories`),
  });

  const textChannels = useQuery({
    queryKey: ['text-channels', guildId],
    queryFn: () => api<{ id: string; name: string }[]>(`/api/guilds/${guildId}/text-channels`),
  });

  const roles = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => api<{ id: string; name: string }[]>(`/api/guilds/${guildId}/roles`),
  });

  if (cfg.isLoading) return <FormSkeleton sections={3} />;

  const base = cfg.data;
  const dirty = form.formState.isDirty;

  const onSave = form.handleSubmit((v) => {
    patch.mutate({ tickets: v });
  });

  const channelSelect = (
    options: { id: string; name: string }[],
    value: string | null,
    onChange: (v: string | null) => void,
    placeholder: string,
  ) => (
    <select
      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">— {placeholder} —</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );

  return (
    <form className="grid gap-8" onSubmit={onSave}>
      {/* General Settings */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Ticket className="h-5 w-5 text-violet-400" />
          {t('tickets.title')}
        </h3>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...form.register('enabled')} />
          <span>{t('tickets.enabled')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('tickets.enabled.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('tickets.category')}</span>
          {channelSelect(categories.data ?? [], form.watch('category_id'), (v) => form.setValue('category_id', v, { shouldDirty: true }), t('tickets.category.placeholder'))}
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('tickets.category.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('tickets.supportRole')}</span>
          {channelSelect(roles.data ?? [], form.watch('support_role_id'), (v) => form.setValue('support_role_id', v, { shouldDirty: true }), t('tickets.supportRole.placeholder'))}
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('tickets.supportRole.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('tickets.panelChannel')}</span>
          {channelSelect(textChannels.data ?? [], form.watch('panel_channel_id'), (v) => form.setValue('panel_channel_id', v, { shouldDirty: true }), t('tickets.panelChannel.placeholder'))}
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('tickets.panelChannel.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('tickets.logChannel')}</span>
          {channelSelect(textChannels.data ?? [], form.watch('log_channel_id'), (v) => form.setValue('log_channel_id', v, { shouldDirty: true }), t('tickets.logChannel.placeholder'))}
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('tickets.logChannel.hint')}</p>
      </section>

      {/* Messages */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('tickets.messages')}</h3>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('tickets.welcomeMessage')}</span>
          <textarea
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
            maxLength={2000}
            rows={3}
            placeholder={t('tickets.welcomeMessage.placeholder')}
            {...form.register('welcome_message')}
          />
        </label>
        <p className="mb-3 text-xs text-slate-500">{t('tickets.welcomeMessage.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('tickets.closeMessage')}</span>
          <textarea
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
            maxLength={2000}
            rows={3}
            placeholder={t('tickets.closeMessage.placeholder')}
            {...form.register('close_message')}
          />
        </label>
        <p className="mb-3 text-xs text-slate-500">{t('tickets.closeMessage.hint')}</p>
      </section>

      {/* Auto-close */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('tickets.autoClose')}</h3>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('tickets.autoClose.hours')}</span>
          <select
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
            {...form.register('auto_close_hours', { valueAsNumber: true })}
          >
            {AUTO_CLOSE_CHOICES.map((h) => (
              <option key={h} value={h}>
                {h === 0 ? t('tickets.autoClose.off') : `${h}h`}
              </option>
            ))}
          </select>
        </label>
        <p className="mb-3 text-xs text-slate-500">{t('tickets.autoClose.hint')}</p>
      </section>

      {/* Ticket Log */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('tickets.log')}</h3>
        {tickets.isLoading && <p className="text-sm text-slate-400">{t('loading')}</p>}
        {tickets.error && (
          <p className="text-sm text-red-400">
            {tickets.error instanceof ApiError && tickets.error.code === 'PREMIUM_REQUIRED'
              ? t('tickets.log.premium')
              : t('error.generic')}
          </p>
        )}
        {tickets.data && tickets.data.length === 0 && (
          <p className="text-sm text-slate-500">{t('tickets.log.empty')}</p>
        )}
        {tickets.data && tickets.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">{t('tickets.log.user')}</th>
                  <th className="pb-2 pr-4">{t('tickets.log.status')}</th>
                  <th className="pb-2 pr-4">{t('tickets.log.created')}</th>
                  <th className="pb-2 pr-4">{t('tickets.log.closed')}</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {tickets.data.map((tkt) => (
                  <tr key={tkt._id} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-mono text-xs">{tkt._id.slice(-6)}</td>
                    <td className="py-2 pr-4">{memberNames.data?.[tkt.user_id] ?? tkt.user_id}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${tkt.status === 'open' ? 'bg-green-400/20 text-green-300' : 'bg-slate-400/20 text-slate-400'}`}>
                        {tkt.status === 'open' ? t('tickets.log.open') : t('tickets.log.closedStatus')}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{new Date(tkt.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{tkt.closed_at ? new Date(tkt.closed_at).toLocaleDateString() : '—'}</td>
                    <td className="py-2">
                      {tkt.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t('tickets.log.closeConfirm'))) closeTicket.mutate(tkt._id);
                          }}
                          disabled={closeTicket.isPending}
                          className="rounded-lg bg-red-500/20 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/30 disabled:opacity-40"
                        >
                          {t('tickets.log.closeBtn')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SaveBar dirty={dirty} saving={patch.isPending} />
    </form>
  );
}
