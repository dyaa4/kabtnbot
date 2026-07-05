import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface Meta {
  clientId: string;
  inviteUrl: string;
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h3 className="mb-2 text-lg font-semibold text-indigo-300">{title}</h3>
      <p className="text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

export function Landing() {
  const { t, lang, setLang } = useI18n();
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/api/meta') });

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-bold text-indigo-400">GameBot</span>
        <button
          className="rounded border border-slate-700 px-2 py-1 text-sm"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        >
          {t('lang.switch')}
        </button>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-12 pt-16 text-center">
        <h1 className="mb-4 text-4xl font-extrabold leading-tight">{t('landing.title')}</h1>
        <p className="mb-8 text-lg text-slate-400">{t('landing.tagline')}</p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href={meta.data?.inviteUrl ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold hover:bg-indigo-500"
          >
            {t('landing.cta.invite')}
          </a>
          <a href="/auth/discord" className="rounded-lg border border-slate-700 px-6 py-3 font-semibold hover:bg-slate-900">
            {t('landing.cta.login')}
          </a>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-6 px-6 pb-16 sm:grid-cols-3">
        <FeatureCard title={t('landing.feature.customs.title')} body={t('landing.feature.customs.body')} />
        <FeatureCard title={t('landing.feature.voice.title')} body={t('landing.feature.voice.body')} />
        <FeatureCard title={t('landing.feature.board.title')} body={t('landing.feature.board.body')} />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-8">
          <h2 className="mb-2 text-2xl font-bold text-amber-300">{t('landing.premium.title')}</h2>
          <p className="text-slate-400">{t('landing.premium.body')}</p>
        </div>
      </section>
    </div>
  );
}
