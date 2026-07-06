import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { LangSwitcher } from './LangSwitcher.js';

interface Me {
  uid: string;
  uname: string;
  avatar: string | null;
}

interface BotStatus {
  online: boolean;
  last_seen: string | null;
  guild_count: number;
}

function BotStatusBadge() {
  const { t } = useI18n();
  const status = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => api<BotStatus>('/api/status'),
    refetchInterval: 60_000,
    retry: false,
  });
  if (!status.data) return null;
  const online = status.data.online;
  return (
    <span
      data-testid="bot-status"
      title={status.data.last_seen ?? ''}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        online ? 'border-emerald-500/30 bg-emerald-900/30 text-emerald-300' : 'border-red-500/30 bg-red-900/30 text-red-300'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'animate-pulse bg-emerald-400' : 'bg-red-400'}`} />
      {online ? t('bot.online') : t('bot.offline')}
    </span>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), retry: false });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/70 px-6 py-4 backdrop-blur-md">
        <Link
          to="/app"
          className="text-xl font-black"
        >
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">{t('brand.name')}</span>
          <span className="ms-1 text-slate-400">{t('brand.suffix')}</span>
        </Link>
        <div className="flex items-center gap-4">
          <BotStatusBadge />
          <LangSwitcher />
          {me.data && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300">{me.data.uname}</span>
              <button
                className="text-sm text-slate-400 hover:text-cyan-300"
                onClick={async () => {
                  await fetch('/auth/logout', { method: 'POST' });
                  window.location.href = '/';
                }}
              >
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
