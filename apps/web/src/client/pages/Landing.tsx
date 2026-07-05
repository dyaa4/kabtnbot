import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { KabtnBot } from '../components/KabtnBot.js';

interface Meta {
  clientId: string;
  inviteUrl: string;
}

function DiscordIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" className={className} aria-hidden="true">
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
    </svg>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-[0_0_30px_-8px_rgba(34,211,238,0.5)]">
      <h3 className="mb-2 text-lg font-semibold text-indigo-300 transition group-hover:text-cyan-300">{title}</h3>
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
        <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-xl font-black text-transparent">
          Kabtn
        </span>
        <button
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm backdrop-blur transition hover:border-cyan-400/40 hover:bg-white/10"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        >
          {t('lang.switch')}
        </button>
      </header>

      <section className="relative overflow-hidden px-6 pb-12 pt-16">
        <div className="pointer-events-none absolute -start-24 -top-24 h-80 w-80 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -end-16 top-10 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />

        <div className="relative mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
          <div className="text-center md:text-start">
            <h1 className="mb-4 text-4xl font-extrabold leading-tight md:text-5xl">{t('landing.title')}</h1>
            <p className="mb-8 text-lg text-slate-400">{t('landing.tagline')}</p>
            <div className="flex flex-wrap justify-center gap-4 md:justify-start">
              <a
                href={meta.data?.inviteUrl ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-6 py-3 font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(99,102,241,0.7)] transition hover:scale-105 hover:shadow-[0_0_40px_-4px_rgba(34,211,238,0.8)]"
              >
                {t('landing.cta.invite')}
              </a>
              <a
                href="/auth/discord"
                className="flex items-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 font-semibold text-white shadow-[0_0_24px_-6px_rgba(88,101,242,0.7)] transition hover:scale-105 hover:bg-[#4752C4]"
              >
                <DiscordIcon className="h-5 w-5 shrink-0 fill-current" />
                {t('landing.cta.login')}
              </a>
            </div>
          </div>

          <div className="mx-auto flex w-[280px] justify-center md:w-[340px]">
            <KabtnBot className="w-full max-w-[320px]" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-6 px-6 pb-16 sm:grid-cols-3">
        <FeatureCard title={t('landing.feature.voice.title')} body={t('landing.feature.voice.body')} />
        <FeatureCard title={t('landing.feature.protection.title')} body={t('landing.feature.protection.body')} />
        <FeatureCard title={t('landing.feature.activity.title')} body={t('landing.feature.activity.body')} />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <div className="rounded-2xl border border-amber-700/40 bg-amber-950/20 p-8 backdrop-blur-md">
          <h2 className="mb-2 text-2xl font-bold text-amber-300">{t('landing.premium.title')}</h2>
          <p className="text-slate-400">{t('landing.premium.body')}</p>
        </div>
      </section>
    </div>
  );
}
