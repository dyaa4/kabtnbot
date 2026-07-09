import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';
import { GuildListSkeleton } from '../components/Skeleton.js';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export function GuildList() {
  const { t } = useI18n();
  const guilds = useQuery({ queryKey: ['guilds'], queryFn: () => api<Guild[]>('/api/guilds') });

  return (
    <Layout>
      <h1 className="mb-6 text-2xl font-bold">{t('guilds.title')}</h1>
      {guilds.isLoading && <GuildListSkeleton />}
      {guilds.data?.length === 0 && <p className="text-slate-400">{t('guilds.empty')}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {guilds.data?.map((g) => (
          <Link
            key={g.id}
            to={`/app/${g.id}`}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-[0_0_30px_-8px_rgba(99,102,241,0.5)]"
          >
            {g.icon ? (
              <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`} alt="" className="h-10 w-10 rounded-full" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-slate-950">
                {g.name.slice(0, 1)}
              </div>
            )}
            <span className="font-semibold">{g.name}</span>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
