import { useI18n } from '../../i18n.js';
import { HomeImage } from '../HomeImage.js';
import { DiscordIcon } from './icons.js';

export function Hero({ inviteUrl, guilds }: { inviteUrl: string; guilds: number }) {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-12 md:pt-16">
      {/* fantastical backdrop: starfields, drifting auroras, neon floor */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-stars absolute inset-0" />
        <div className="hero-stars-2 absolute inset-0" />
        <div className="hero-aurora absolute -start-32 -top-40 h-[30rem] w-[30rem] rounded-full bg-indigo-600/35 blur-3xl" />
        <div className="hero-aurora-slow absolute -end-24 -top-10 h-[26rem] w-[26rem] rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="hero-grid absolute inset-x-[-10%] bottom-0 h-72" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-[1fr_auto] md:gap-4">
        <div className="text-center md:text-start">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-sm font-semibold text-cyan-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            {t('landing.badge')}
          </span>
          <h1 className="hero-title mb-5 text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl">
            {t('landing.title')}
          </h1>
          <p className="mx-auto mb-6 max-w-xl text-lg leading-8 text-slate-400 md:mx-0 md:text-xl">
            {t('landing.tagline')}
          </p>
          <div className="mb-5 flex flex-wrap justify-center gap-4 md:justify-start">
            <a
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-7 py-3.5 font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(99,102,241,0.7)] transition hover:scale-105 hover:shadow-[0_0_40px_-4px_rgba(34,211,238,0.8)]"
            >
              {t('landing.cta.invite')}
            </a>
            <a
              href="/auth/discord"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-white backdrop-blur transition hover:scale-105 hover:border-[#5865F2] hover:bg-[#5865F2]/20"
            >
              <DiscordIcon className="h-5 w-5 shrink-0 fill-current" />
              {t('landing.cta.login')}
            </a>
          </div>
          {guilds >= 3 && (
            <p className="text-sm font-semibold text-cyan-300/90">
              {t('landing.social').replace('{count}', String(guilds))}
            </p>
          )}
        </div>

        {/* holographic stage: spinning rings + light beam behind the robot */}
        <div className="relative mx-auto w-[300px] sm:w-[400px] md:w-[440px] lg:w-[520px]">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div
              className="absolute bottom-[4%] left-1/2 h-[92%] w-[68%] -translate-x-1/2 bg-gradient-to-t from-cyan-400/25 via-indigo-500/10 to-transparent blur-2xl"
              style={{ clipPath: 'polygon(18% 100%, 82% 100%, 62% 0%, 38% 0%)' }}
            />
            <div className="absolute bottom-[-2%] left-1/2 h-[14%] w-[80%] -translate-x-1/2 rounded-[50%] bg-cyan-400/25 blur-2xl" />
            <div className="absolute bottom-[-16%] left-1/2 aspect-square w-[105%] -translate-x-1/2">
              <div className="hero-ring h-full w-full border-2 border-cyan-400/40 shadow-[0_0_24px_rgba(34,211,238,0.35)] [border-style:dashed]" />
            </div>
            <div className="absolute bottom-[-12%] left-1/2 aspect-square w-[82%] -translate-x-1/2">
              <div className="hero-ring-rev h-full w-full border border-indigo-400/50 shadow-[0_0_18px_rgba(99,102,241,0.4)]" />
            </div>
            <span className="hero-particle absolute start-[8%] top-[30%] h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
            <span className="hero-particle absolute end-[6%] top-[46%] h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(129,140,248,0.9)] [animation-delay:-1.6s]" />
            <span className="hero-particle absolute end-[14%] top-[16%] h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(196,181,253,0.9)] [animation-delay:-2.2s]" />
          </div>
          <HomeImage className="relative z-10 w-full" />
        </div>
      </div>
    </section>
  );
}
