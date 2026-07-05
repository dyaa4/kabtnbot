import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';

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
      {guilds.isLoading && <p className="text-slate-400">{t('loading')}</p>}
      {guilds.data?.length === 0 && <p className="text-slate-400">{t('guilds.empty')}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {guilds.data?.map((g) => (
          <Link
            key={g.id}
            to={`/app/${g.id}`}
            className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 hover:border-indigo-500"
          >
            {g.icon ? (
              <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`} alt="" className="h-10 w-10 rounded-full" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 font-bold">
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
