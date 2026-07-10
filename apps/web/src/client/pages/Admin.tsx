import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';
import { useToast } from '../components/Toast.js';

interface AdminGuild {
  guild_id: string;
  name: string;
  member_count: number;
  blocked: boolean;
  joined_at: string;
  premium: boolean;
}

const BTN = 'rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold transition';

export function Admin() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();

  const me = useQuery({ queryKey: ['admin-me'], queryFn: () => api<{ isSuperAdmin: boolean }>('/api/admin/me'), retry: false });
  const guilds = useQuery({
    queryKey: ['admin-guilds'],
    queryFn: () => api<AdminGuild[]>('/api/admin/guilds'),
    enabled: me.data?.isSuperAdmin === true,
  });

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) => api(path, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(t('settings.saved'));
      void qc.invalidateQueries({ queryKey: ['admin-guilds'] });
    },
    onError: () => toast.error(t('error.generic')),
  });

  if (me.isLoading) return <Layout><p className="text-slate-400">{t('loading')}</p></Layout>;
  if (!me.data?.isSuperAdmin) return <Layout><p className="text-slate-400">{t('admin.notAllowed')}</p></Layout>;

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB');

  return (
    <Layout>
      <h1 className="mb-2 text-2xl font-bold">{t('admin.title')}</h1>
      {guilds.data && (
        <p className="mb-6 text-sm text-slate-400">{guilds.data.length} {t('admin.serversCount')}</p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="p-3 text-start">{t('admin.server')}</th>
              <th className="p-3 text-start">{t('admin.members')}</th>
              <th className="p-3 text-start">{t('admin.joined')}</th>
              <th className="p-3 text-start">{t('admin.status')}</th>
              <th className="p-3 text-start">{t('admin.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {guilds.data?.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-slate-500">{t('admin.empty')}</td></tr>
            )}
            {guilds.data?.map((g) => (
              <tr key={g.guild_id} className="border-t border-white/5">
                <td className="p-3">
                  <div className="font-semibold text-slate-200">{g.name || g.guild_id}</div>
                  <div className="text-xs text-slate-500" dir="ltr">{g.guild_id}</div>
                </td>
                <td className="p-3 text-slate-400" dir="ltr">{g.member_count.toLocaleString(lang === 'ar' ? 'ar' : 'en-GB')}</td>
                <td className="p-3 text-slate-400" dir="ltr">{fmtDate(g.joined_at)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {g.premium && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 text-xs text-amber-300">Premium</span>
                    )}
                    {g.blocked && (
                      <span className="rounded-full border border-red-500/40 bg-red-950/40 px-2 py-0.5 text-xs text-red-300">{t('admin.blocked')}</span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`${BTN} text-amber-300 hover:border-amber-400/50`}
                      onClick={() => act.mutate({ path: `/api/admin/guilds/${g.guild_id}/premium`, body: { value: !g.premium } })}
                    >
                      {g.premium ? t('admin.revokePremium') : t('admin.grantPremium')}
                    </button>
                    <button
                      type="button"
                      className={`${BTN} text-slate-300 hover:border-cyan-400/50`}
                      onClick={() => act.mutate({ path: `/api/admin/guilds/${g.guild_id}/block`, body: { value: !g.blocked } })}
                    >
                      {g.blocked ? t('admin.unblock') : t('admin.block')}
                    </button>
                    <button
                      type="button"
                      className={`${BTN} text-red-300 hover:border-red-400/50`}
                      onClick={() => {
                        if (window.confirm(t('admin.confirmKick'))) {
                          act.mutate({ path: `/api/admin/guilds/${g.guild_id}/leave`, body: {} });
                        }
                      }}
                    >
                      {t('admin.kick')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
