import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface Me {
  uid: string;
  uname: string;
  avatar: string | null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), retry: false });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/70 px-6 py-4 backdrop-blur-md">
        <Link
          to="/app"
          className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-xl font-black text-transparent"
        >
          Kabtn
        </Link>
        <div className="flex items-center gap-4">
          <button
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm backdrop-blur transition hover:border-cyan-400/40 hover:bg-white/10"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          >
            {t('lang.switch')}
          </button>
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
