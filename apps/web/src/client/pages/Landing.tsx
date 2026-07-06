import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { HomeImage } from '../components/HomeImage.js';

interface Meta {
  clientId: string;
  inviteUrl: string;
  guilds?: number;
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
        <span className="text-xl font-black">
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">{t('brand.name')}</span>
          <span className="ms-1 text-slate-400">{t('brand.suffix')}</span>
        </span>
        <button
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm backdrop-blur transition hover:border-cyan-400/40 hover:bg-white/10"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        >
          {t('lang.switch')}
        </button>
      </header>

      <section className="relative overflow-hidden px-6 pb-16 pt-10 md:pt-14">
        {/* fantastical backdrop: starfields, drifting auroras, neon floor */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-stars absolute inset-0" />
          <div className="hero-stars-2 absolute inset-0" />
          <div className="hero-aurora absolute -start-32 -top-40 h-[30rem] w-[30rem] rounded-full bg-indigo-600/35 blur-3xl" />
          <div className="hero-aurora-slow absolute -end-24 -top-10 h-[26rem] w-[26rem] rounded-full bg-cyan-500/25 blur-3xl" />
          <div className="hero-aurora absolute -bottom-32 left-1/2 h-[22rem] w-[40rem] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-3xl" />
          <div className="hero-grid absolute inset-x-[-10%] bottom-0 h-72" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-6 md:grid-cols-[1fr_auto] md:gap-2">
          <div className="text-center md:text-start">
            <h1 className="hero-title mb-4 text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl">
              {t('landing.title')}
            </h1>
            <p className="mb-4 text-lg text-slate-400 md:text-xl">{t('landing.tagline')}</p>
            {(meta.data?.guilds ?? 0) >= 3 && (
              <p className="mb-6 text-sm font-semibold text-cyan-300/90">
                {t('landing.social').replace('{count}', String(meta.data?.guilds))}
              </p>
            )}
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

          {/* holographic stage: spinning rings + light beam + particles behind a much larger robot */}
          <div className="relative mx-auto w-[320px] sm:w-[420px] md:w-[480px] lg:w-[560px]">
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              {/* vertical light beam rising behind the robot */}
              <div
                className="absolute bottom-[4%] left-1/2 h-[92%] w-[68%] -translate-x-1/2 bg-gradient-to-t from-cyan-400/25 via-indigo-500/10 to-transparent blur-2xl"
                style={{ clipPath: 'polygon(18% 100%, 82% 100%, 62% 0%, 38% 0%)' }}
              />
              {/* platform glow */}
              <div className="absolute bottom-[-2%] left-1/2 h-[14%] w-[80%] -translate-x-1/2 rounded-[50%] bg-cyan-400/25 blur-2xl" />
              {/* spinning hologram rings (outer element positions, inner element spins) */}
              <div className="absolute bottom-[-16%] left-1/2 aspect-square w-[105%] -translate-x-1/2">
                <div className="hero-ring h-full w-full border-2 border-cyan-400/40 shadow-[0_0_24px_rgba(34,211,238,0.35)] [border-style:dashed]" />
              </div>
              <div className="absolute bottom-[-12%] left-1/2 aspect-square w-[82%] -translate-x-1/2">
                <div className="hero-ring-rev h-full w-full border border-indigo-400/50 shadow-[0_0_18px_rgba(99,102,241,0.4)]" />
              </div>
              {/* floating spark particles */}
              <span className="hero-particle absolute start-[8%] top-[30%] h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
              <span className="hero-particle absolute end-[6%] top-[46%] h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(129,140,248,0.9)] [animation-delay:-1.6s]" />
              <span className="hero-particle absolute start-[16%] top-[68%] h-1.5 w-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_8px_rgba(232,121,249,0.9)] [animation-delay:-3.1s]" />
              <span className="hero-particle absolute end-[14%] top-[16%] h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(196,181,253,0.9)] [animation-delay:-2.2s]" />
              <span className="hero-particle absolute end-[24%] top-[74%] h-1 w-1 rounded-full bg-cyan-200 shadow-[0_0_6px_rgba(165,243,252,0.9)] [animation-delay:-0.8s]" />
            </div>
            <HomeImage className="relative z-10 w-full" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-6 px-6 pb-16 sm:grid-cols-3">
        <FeatureCard title={t('landing.feature.voice.title')} body={t('landing.feature.voice.body')} />
        <FeatureCard title={t('landing.feature.protection.title')} body={t('landing.feature.protection.body')} />
        <FeatureCard title={t('landing.feature.activity.title')} body={t('landing.feature.activity.body')} />
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-24">
        <h2 className="mb-8 text-center text-3xl font-extrabold">{t('pricing.title')}</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Free plan */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-md">
            <h3 className="mb-1 text-2xl font-bold text-cyan-300">{t('pricing.free.title')}</h3>
            <p className="mb-6 text-sm text-slate-400">{t('pricing.free.tagline')}</p>
            <ul className="grid gap-3 text-sm text-slate-300">
              {(['protection', 'welcome', 'botProfile'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="mt-0.5 text-cyan-400">✓</span>
                  <span>{t(`pricing.free.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Premium plan — highlighted, coming soon */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-500/60 via-violet-500/60 to-amber-400/60 p-[1.5px] shadow-[0_0_40px_-10px_rgba(139,92,246,0.6)]">
            <div className="h-full rounded-2xl bg-slate-950/90 p-8 backdrop-blur-md">
              <div className="mb-1 flex items-center gap-3">
                <h3 className="text-2xl font-bold text-amber-300">{t('pricing.premium.title')}</h3>
                <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                  {t('pricing.premium.badge')}
                </span>
              </div>
              <p className="mb-6 text-sm text-slate-400">{t('pricing.premium.tagline')}</p>
              <ul className="grid gap-3 text-sm text-slate-300">
                {(['everything', 'voice', 'stats', 'voicelog', 'limits'] as const).map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-300">★</span>
                    <span>{t(`pricing.premium.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
          <span>
            © 2026 <span className="font-semibold text-slate-400">{t('brand.name')}</span>
          </span>
          <div className="flex gap-6">
            <a href="/terms" className="transition hover:text-cyan-300">
              {t('footer.terms')}
            </a>
            <a href="/privacy" className="transition hover:text-cyan-300">
              {t('footer.privacy')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
