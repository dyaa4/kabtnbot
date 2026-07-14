import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';
import { useToast } from '../components/Toast.js';

interface AdminUser {
  user_id: string;
  uname: string;
  avatar: string | null;
  premium_active: boolean;
  blocked: boolean;
  linked_guild_ids: string[];
  last_login: string | null;
}

interface AdminGuild {
  guild_id: string;
  name: string;
  member_count: number;
  blocked: boolean;
  joined_at: string;
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
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<AdminUser[]>('/api/admin/users'),
    enabled: me.data?.isSuperAdmin === true,
  });

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) => api(path, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(t('settings.saved'));
      void qc.invalidateQueries({ queryKey: ['admin-guilds'] });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => toast.error(t('error.generic')),
  });

  if (me.isLoading) return <Layout><p className="text-slate-400">{t('loading')}</p></Layout>;
  if (!me.data?.isSuperAdmin) return <Layout><p className="text-slate-400">{t('admin.notAllowed')}</p></Layout>;

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB');

  return (
    <Layout>
      <h1 className="mb-2 text-2xl font-bold">{t('admin.title')}</h1>

      <h2 className="mb-2 mt-4 text-lg font-semibold">{t('admin.users.title')}</h2>
      <div className="mb-8 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="p-3 text-start">{t('admin.users.user')}</th>
              <th className="p-3 text-start">{t('admin.users.links')}</th>
              <th className="p-3 text-start">{t('admin.users.lastLogin')}</th>
              <th className="p-3 text-start">{t('admin.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-slate-500">{t('admin.users.empty')}</td></tr>
            )}
            {users.data?.map((u) => (
              <tr key={u.user_id} className="border-t border-white/5">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {u.avatar ? (
                      <img src={`https://cdn.discordapp.com/avatars/${u.user_id}/${u.avatar}.png?size=32`} alt="" className="h-6 w-6 rounded-full" />
                    ) : (
                      <span className="h-6 w-6 rounded-full bg-white/10" />
                    )}
                    <div>
                      <div className="font-semibold text-slate-200">{u.uname || u.user_id}</div>
                      <div className="text-xs text-slate-500" dir="ltr">{u.user_id}</div>
                    </div>
                    {u.premium_active && (
                      <span className="ms-1 rounded-full border border-blue-500/40 bg-blue-950/40 px-2 py-0.5 text-xs text-blue-300">Premium</span>
                    )}
                    {u.blocked && (
                      <span className="ms-1 rounded-full border border-red-500/40 bg-red-950/40 px-2 py-0.5 text-xs text-red-300">{t('admin.blocked')}</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-slate-400" dir="ltr">{u.linked_guild_ids.length}/{u.premium_active ? 3 : 1}</td>
                <td className="p-3 text-slate-400" dir="ltr">{u.last_login ? fmtDate(u.last_login) : '—'}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`${BTN} text-blue-300 hover:border-blue-400/50`}
                      onClick={() => act.mutate({ path: `/api/admin/users/${u.user_id}/premium`, body: { value: !u.premium_active } })}
                    >
                      {u.premium_active ? t('admin.revokePremium') : t('admin.grantPremium')}
                    </button>
                    <button
                      type="button"
                      className={`${BTN} text-red-300 hover:border-red-400/50`}
                      onClick={() => act.mutate({ path: `/api/admin/users/${u.user_id}/block`, body: { value: !u.blocked } })}
                    >
                      {u.blocked ? t('admin.unblock') : t('admin.block')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-semibold">{t('admin.servers.title')}</h2>
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
                    {g.blocked && (
                      <span className="rounded-full border border-red-500/40 bg-red-950/40 px-2 py-0.5 text-xs text-red-300">{t('admin.blocked')}</span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`${BTN} text-slate-300 hover:border-blue-400/50`}
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
