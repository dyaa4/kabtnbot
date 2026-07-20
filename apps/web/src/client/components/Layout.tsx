import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { LangSwitcher } from './LangSwitcher.js';
import { ThemeToggle } from './ThemeToggle.js';

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
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs sm:px-2.5 ${
        online ? 'border-emerald-500/30 bg-emerald-900/30 text-emerald-300' : 'border-red-500/30 bg-red-900/30 text-red-300'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'animate-pulse bg-emerald-400' : 'bg-red-400'}`} />
      {/* Label hides on mobile to save navbar width — the dot still conveys state. */}
      <span className="hidden sm:inline">{online ? t('bot.online') : t('bot.offline')}</span>
    </span>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), retry: false });
  const admin = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => api<{ isSuperAdmin: boolean }>('/api/admin/me'),
    retry: false,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/70 px-4 py-4 backdrop-blur-md sm:px-6">
        {/* The brand goes to the public home page; the landing header is
            session-aware (shows a Dashboard button when logged in), so this no
            longer reads as a logout. */}
        <Link
          to="/"
          className="shrink-0 text-xl font-black"
        >
          <span className="bg-gradient-to-r from-blue-400 via-blue-400 to-blue-400 bg-clip-text text-transparent">{t('brand.name')}</span>
          <span className="ms-1 text-slate-400">{t('brand.suffix')}</span>
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          {/* Same-tab nav to the landing #features — the session-aware landing
              header keeps a way back to the dashboard, so no new tab needed. */}
          <a
            href="/#features"
            className="hidden text-sm font-semibold text-slate-300 transition hover:text-blue-300 sm:block"
          >
            {t('landing.nav.features')}
          </a>
          {admin.data?.isSuperAdmin && (
            <Link to="/admin" className="text-sm font-semibold text-blue-300 transition hover:text-blue-200">
              {t('admin.nav')}
            </Link>
          )}
          <BotStatusBadge />
          <ThemeToggle />
          <LangSwitcher />
          {me.data && (
            <div className="flex items-center gap-2">
              {/* Username hides on mobile — the logout button is enough there. */}
              <span className="hidden max-w-[8rem] truncate text-sm text-slate-300 sm:inline">{me.data.uname}</span>
              <button
                className="shrink-0 text-sm text-slate-400 hover:text-blue-300"
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
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">{children}</main>
      <footer className="border-t border-white/10 px-6 py-6 text-sm text-slate-500">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link to="/terms" className="transition hover:text-blue-300">{t('footer.terms')}</Link>
          <Link to="/privacy" className="transition hover:text-blue-300">{t('footer.privacy')}</Link>
        </div>
      </footer>
    </div>
  );
}
