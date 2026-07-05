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
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <Link to="/app" className="text-xl font-bold text-indigo-400">
          GameBot
        </Link>
        <div className="flex items-center gap-4">
          <button
            className="rounded border border-slate-700 px-2 py-1 text-sm"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          >
            {t('lang.switch')}
          </button>
          {me.data && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300">{me.data.uname}</span>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
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
