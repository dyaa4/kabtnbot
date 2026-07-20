import { Sparkles, Hash, Volume2, Folder } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
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

interface PreviewResp {
  channels: GuildChannelLite[];
  plan: OrganizePlan;
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

/** AI channel organizer — Phase 1: generate a proposed layout for PREVIEW only.
 * Premium (a PREMIUM-linked guild), mirroring the voice assistant gate. */
export function ChannelsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const { loading, voicePremium } = usePremiumStatus(guildId);

  const preview = useMutation({
    mutationFn: () =>
      api<PreviewResp>(`/api/guilds/${guildId}/channels/organize/preview`, {
        method: 'POST',
        body: JSON.stringify({ otherLabel: t('channels.uncategorized') }),
      }),
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : '';
      toast.error(code === 'AI_BAD_OUTPUT' ? t('channels.error.ai') : t('error.generic'));
    },
  });

  if (loading) return <FormSkeleton sections={1} />;
  if (!voicePremium) return <PremiumUpsell title={t('channels.premium.title')} body={t('channels.premium.body')} />;

  const data = preview.data;

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5 text-blue-400" /> {t('channels.title')}
            </h3>
            <p className="mt-1 max-w-xl text-sm text-slate-400">{t('channels.intro')}</p>
          </div>
          <button
            onClick={() => preview.mutate()}
            disabled={preview.isPending}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-400 px-5 py-3 font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(59,130,246,0.7)] transition hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> {preview.isPending ? t('channels.generating') : t('channels.organize')}
          </button>
        </div>
        <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          {t('channels.previewOnly')}
        </p>
      </section>

      {data && (
        <div className="grid gap-6 md:grid-cols-2">
          <LayoutColumn title={t('channels.before')} groups={currentGroups(data.channels, t('channels.uncategorized'))} muted />
          <LayoutColumn title={t('channels.after')} groups={planGroups(data.plan, data.channels)} />
        </div>
      )}
    </div>
  );
}
