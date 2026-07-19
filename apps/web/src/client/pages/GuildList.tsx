import { Link } from 'react-router-dom';
import { Gem, Link2, Plus, Unlink } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';
import { GuildListSkeleton } from '../components/Skeleton.js';
import { useToast } from '../components/Toast.js';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

interface UserPlan {
  premium: boolean;
  max_links: number;
  linked_guild_ids: string[];
}

interface Meta {
  clientId: string;
  inviteUrl: string;
}

export function GuildList() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const guilds = useQuery({ queryKey: ['guilds'], queryFn: () => api<Guild[]>('/api/guilds') });
  const plan = useQuery({ queryKey: ['plan'], queryFn: () => api<UserPlan>('/api/me/plan') });
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/api/meta') });

  const setLink = useMutation({
    mutationFn: ({ guildId, link }: { guildId: string; link: boolean }) =>
      api<UserPlan>(`/api/guilds/${guildId}/link`, { method: link ? 'POST' : 'DELETE' }),
    onSuccess: (next) => qc.setQueryData(['plan'], next),
    onError: (err) => {
      toast.error(
        err instanceof ApiError && err.code === 'LINK_LIMIT'
          ? t('guilds.linkLimit')
          : t('error.generic'),
      );
    },
  });

  const linked = new Set(plan.data?.linked_guild_ids ?? []);

  return (
    <Layout>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('guilds.title')}</h1>
        {meta.data && (
          <a
            href={meta.data.inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t('guilds.add')}
          </a>
        )}
      </div>
      {plan.data && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/5 px-4 py-3">
          <Gem className="h-4 w-4 shrink-0 text-blue-300" />
          <span className="text-sm font-semibold text-blue-200">
            {t('guilds.links.count')
              .replace('{used}', String(linked.size))
              .replace('{max}', String(plan.data.max_links))}
          </span>
          <span className="text-xs text-slate-400">{t('guilds.links.hint')}</span>
        </div>
      )}
      {guilds.isLoading && <GuildListSkeleton />}
      {guilds.data?.length === 0 && <p className="text-slate-400">{t('guilds.empty')}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {guilds.data?.map((g) => {
          const isLinked = linked.has(g.id);
          return (
            <Link
              key={g.id}
              to={`/app/${g.id}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition hover:-translate-y-1 hover:border-blue-400/40 hover:shadow-[0_0_30px_-8px_rgba(59,130,246,0.5)]"
            >
              <span className="flex items-center gap-3">
                {g.icon ? (
                  <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`} alt="" className="h-10 w-10 rounded-full" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-400 font-bold text-slate-950">
                    {g.name.slice(0, 1)}
                  </span>
                )}
                <span className="font-semibold">{g.name}</span>
              </span>
              <span className="mt-3 flex items-center gap-2">
                {isLinked && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 text-xs font-semibold text-blue-200">
                    <Gem className="h-3 w-3" /> {t('guilds.linked')}
                  </span>
                )}
                <button
                  type="button"
                  disabled={setLink.isPending}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:border-blue-400/50 hover:text-blue-200"
                  onClick={(e) => {
                    // The whole card is a router link — the button must not navigate.
                    e.preventDefault();
                    e.stopPropagation();
                    setLink.mutate({ guildId: g.id, link: !isLinked });
                  }}
                >
                  {isLinked ? <Unlink className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                  {isLinked ? t('guilds.unlink') : t('guilds.link')}
                </button>
              </span>
            </Link>
          );
        })}
        {meta.data && (
          <a
            href={meta.data.inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-4 text-slate-400 transition hover:-translate-y-1 hover:border-blue-400/40 hover:text-blue-200"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-semibold">{t('guilds.add')}</span>
          </a>
        )}
      </div>
    </Layout>
  );
}
