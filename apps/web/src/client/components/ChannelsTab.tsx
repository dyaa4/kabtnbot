import { Sparkles, Hash, Volume2, Folder, Undo2, Check } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ORGANIZABLE_TYPES,
  CATEGORY_TYPE,
  isVoiceType,
  type GuildChannelLite,
  type OrganizePlan,
} from '@gamebot/shared';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { usePremiumStatus } from '../premium.js';
import { PremiumUpsell } from './PremiumUpsell.js';
import { FormSkeleton } from './Skeleton.js';
import { useToast } from './Toast.js';

interface OrganizeUsage {
  used: number;
  limit: number;
  remaining: number;
}
interface PreviewResp {
  channels: GuildChannelLite[];
  plan: OrganizePlan;
  usage: OrganizeUsage;
}
interface StatusResp {
  canUndo: boolean;
  usage: OrganizeUsage;
}

interface Row {
  key: string;
  label: string;
  voice: boolean;
}
interface Group {
  name: string;
  rows: Row[];
}

const isOrganizable = (type: number) => (ORGANIZABLE_TYPES as readonly number[]).includes(type);

/** Group the live channel list by its current categories, in Discord order. */
function currentGroups(channels: GuildChannelLite[], uncategorizedLabel: string): Group[] {
  const byPos = (a: GuildChannelLite, b: GuildChannelLite) => a.position - b.position;
  const organizable = channels.filter((c) => isOrganizable(c.type));
  const toRow = (c: GuildChannelLite): Row => ({ key: c.id, label: c.name, voice: isVoiceType(c.type) });

  const groups: Group[] = [];
  const loose = organizable.filter((c) => !c.parent_id).sort(byPos);
  if (loose.length) groups.push({ name: uncategorizedLabel, rows: loose.map(toRow) });
  for (const cat of channels.filter((c) => c.type === CATEGORY_TYPE).sort(byPos)) {
    const rows = organizable.filter((c) => c.parent_id === cat.id).sort(byPos).map(toRow);
    if (rows.length) groups.push({ name: cat.name, rows });
  }
  return groups;
}

/** Group the proposed plan; channel voice/text is looked up from the live list. */
function planGroups(plan: OrganizePlan, channels: GuildChannelLite[]): Group[] {
  const typeById = new Map(channels.map((c) => [c.id, c.type]));
  return plan.categories.map((cat) => ({
    name: cat.name,
    rows: cat.channels.map((ch) => ({ key: ch.id, label: ch.name, voice: isVoiceType(typeById.get(ch.id) ?? 0) })),
  }));
}

function LayoutColumn({ title, groups, muted }: { title: string; groups: Group[]; muted?: boolean }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
      <h4 className={`mb-4 text-sm font-bold uppercase tracking-wide ${muted ? 'text-slate-400' : 'text-blue-300'}`}>{title}</h4>
      <div className="grid gap-4">
        {groups.map((g, i) => (
          <div key={`${g.name}-${i}`}>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-300">
              <Folder className="h-3.5 w-3.5 shrink-0 text-slate-500" /> {g.name}
            </p>
            <div className="grid gap-0.5 ps-1">
              {g.rows.map((r) => (
                <div key={r.key} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-200">
                  {r.voice ? (
                    <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  ) : (
                    <Hash className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  )}
                  <span className="truncate">{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** AI channel organizer — generate a proposed layout, preview it, then apply it
 * to the server (reversible via Undo). Premium (a PREMIUM-linked guild). */
export function ChannelsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { loading, voicePremium } = usePremiumStatus(guildId);
  const other = t('channels.uncategorized');

  const status = useQuery({
    queryKey: ['organize-status', guildId],
    queryFn: () => api<StatusResp>(`/api/guilds/${guildId}/channels/organize/status`),
    enabled: voicePremium,
  });

  const errText = (err: unknown) =>
    err instanceof ApiError && err.code === 'BOT_MISSING_PERMISSION'
      ? t('channels.error.permission')
      : err instanceof ApiError && err.code === 'ORGANIZE_LIMIT'
        ? t('channels.error.limit')
        : err instanceof ApiError && err.code === 'AI_BAD_OUTPUT'
          ? t('channels.error.ai')
          : t('error.generic');

  const preview = useMutation({
    mutationFn: () =>
      api<PreviewResp>(`/api/guilds/${guildId}/channels/organize/preview`, {
        method: 'POST',
        body: JSON.stringify({ otherLabel: other }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['organize-status', guildId] }),
    onError: (err) => toast.error(errText(err)),
  });

  const apply = useMutation({
    mutationFn: () =>
      api(`/api/guilds/${guildId}/channels/organize/apply`, {
        method: 'POST',
        body: JSON.stringify({ plan: preview.data?.plan, otherLabel: other }),
      }),
    onSuccess: () => {
      toast.success(t('channels.applied'));
      void qc.invalidateQueries({ queryKey: ['organize-status', guildId] });
    },
    onError: (err) => toast.error(errText(err)),
  });

  const undo = useMutation({
    mutationFn: () => api(`/api/guilds/${guildId}/channels/organize/undo`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('channels.undone'));
      preview.reset();
      void qc.invalidateQueries({ queryKey: ['organize-status', guildId] });
    },
    onError: (err) => toast.error(errText(err)),
  });

  if (loading) return <FormSkeleton sections={1} />;
  if (!voicePremium) return <PremiumUpsell title={t('channels.premium.title')} body={t('channels.premium.body')} />;

  const data = preview.data;
  const canUndo = status.data?.canUndo ?? false;
  const usage = status.data?.usage;
  const exhausted = usage ? usage.remaining <= 0 : false;
  const busy = preview.isPending || apply.isPending || undo.isPending;

  const onApply = () => {
    if (window.confirm(t('channels.applyConfirm'))) apply.mutate();
  };

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5 text-blue-400" /> {t('channels.title')}
            </h3>
            <p className="mt-1 max-w-xl text-sm text-slate-400">{t('channels.intro')}</p>
            {usage && (
              <p className={`mt-2 text-xs font-semibold ${exhausted ? 'text-red-300' : 'text-slate-400'}`}>
                {t('channels.quota')
                  .replace('{remaining}', String(usage.remaining))
                  .replace('{limit}', String(usage.limit))}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canUndo && (
              <button
                onClick={() => undo.mutate()}
                disabled={busy}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> {undo.isPending ? t('channels.undoing') : t('channels.undo')}
              </button>
            )}
            <button
              onClick={() => preview.mutate()}
              disabled={busy || exhausted}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-400 px-5 py-3 font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(59,130,246,0.7)] transition hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" /> {preview.isPending ? t('channels.generating') : t('channels.organize')}
            </button>
          </div>
        </div>
        <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          {t('channels.previewOnly')}
        </p>
      </section>

      {data && (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <LayoutColumn title={t('channels.before')} groups={currentGroups(data.channels, other)} muted />
            <LayoutColumn title={t('channels.after')} groups={planGroups(data.plan, data.channels)} />
          </div>
          <div className="flex justify-end">
            <button
              onClick={onApply}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-400 px-6 py-3 font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(16,185,129,0.7)] transition hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {apply.isPending ? t('channels.applying') : t('channels.apply')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
