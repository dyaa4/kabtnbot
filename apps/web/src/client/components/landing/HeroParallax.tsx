import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { useI18n } from '../../i18n.js';
import { DiscordIcon } from './icons.js';
import heroBg from '../../assets/hero-bg.webp';

// Art-driven hero: the rendered scene carries the visual detail; the code adds
// a premium feel with a subtle mouse-tilt + scroll parallax. Depth comes from
// moving the background and the content in opposite directions.
function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function HeroParallax({ inviteUrl, guilds }: { inviteUrl: string; guilds: number }) {
  const { t, lang } = useI18n();
  const sectionRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [interactive] = useState(() => !reducedMotion());

  useEffect(() => {
    if (!interactive) return;
    const section = sectionRef.current;
    if (!section) return;
    let mx = 0, my = 0, sy = 0;
    const apply = () => {
      raf.current = 0;
      // Background drifts AGAINST the cursor + slightly with scroll (depth).
      if (bgRef.current) {
        bgRef.current.style.transform = `scale(1.14) translate3d(${mx * -22}px, ${my * -22 + sy * 0.08}px, 0)`;
      }
      // Content drifts WITH the cursor a little and rises on scroll (foreground).
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${mx * 12}px, ${my * 12 - sy * 0.14}px, 0)`;
        contentRef.current.style.opacity = String(Math.max(0, 1 - sy / (window.innerHeight * 0.7)));
      }
    };
    const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(apply); };
    const onMove = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;
      my = (e.clientY - r.top) / r.height - 0.5;
      schedule();
    };
    const onScroll = () => {
      sy = Math.max(0, -section.getBoundingClientRect().top);
      schedule();
    };
    section.addEventListener('pointermove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    apply();
    return () => {
      section.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [interactive]);

  const socialKey =
    lang === 'ar' && new Intl.PluralRules('ar').select(guilds) === 'few'
      ? 'landing.social.few'
      : 'landing.social';

  return (
    <section ref={sectionRef} className="relative flex min-h-[92vh] items-center overflow-hidden">
      {/* Rendered scene (the bot sits on the LEFT of the art) */}
      <div ref={bgRef} className="absolute inset-0 will-change-transform" style={{ transform: 'scale(1.14)' }}>
        <img src={heroBg} alt="" fetchpriority="high" className="h-full w-full object-cover" />
      </div>

      {/* Scrims: darken the bottom + the RIGHT side where the text lives. */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-l from-slate-950/90 via-slate-950/30 to-transparent" />

      {/* Text overlay — real HTML, pinned to the RIGHT so it never covers the bot. */}
      <div ref={contentRef} className="relative z-10 mx-auto w-full max-w-6xl px-6 will-change-transform">
        <div className="ml-auto max-w-xl text-center md:text-start">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1.5 text-sm font-semibold text-blue-200 backdrop-blur">
            {t('landing.badge')}
          </span>
          <h1 className="hero-title mb-5 text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl">
            {t('landing.title')}
          </h1>
          <p className="mb-7 text-lg text-slate-200">{t('landing.tagline')}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <a
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-400 px-7 py-3.5 font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(59,130,246,0.7)] transition hover:opacity-90"
            >
              {t('landing.cta.invite')}
            </a>
            <a
              href="/auth/discord"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-white backdrop-blur transition hover:border-[#5865F2] hover:bg-[#5865F2]/20"
            >
              <DiscordIcon className="h-5 w-5 shrink-0 fill-current" />
              {t('landing.cta.login')}
            </a>
          </div>
          {guilds >= 3 && (
            <p className="mt-5 text-sm font-semibold text-blue-300">
              <Zap className="inline h-4 w-4 align-[-2px]" /> {t(socialKey).replace('{count}', String(guilds))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
