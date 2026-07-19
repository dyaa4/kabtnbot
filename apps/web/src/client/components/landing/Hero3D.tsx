import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { useI18n } from '../../i18n.js';
import { useTheme } from '../../use-theme.js';
import { useScrollProgress } from '../../hooks/use-scroll-progress.js';
import { Hero } from './Hero.js';
import { DiscordIcon } from './icons.js';
import type { HeroScene } from './hero3d-scene.js';
import mascotUrl from '../../assets/home-image.png';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The interactive 3D hero is opt-in: it needs WebGL, a non-reduced-motion
// preference, and a desktop-sized viewport. Anywhere else (mobile, reduced
// motion, no WebGL, SSR/jsdom) we fall back to the static <Hero>.
function canUse3D(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (window.innerWidth < 768) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function Hero3D({ inviteUrl, guilds }: { inviteUrl: string; guilds: number }) {
  const { t, lang } = useI18n();
  const theme = useTheme();
  const [use3d] = useState(canUse3D);

  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HeroScene | null>(null);
  const progress = useScrollProgress(trackRef);

  // Lazy-load the Three.js scene (keeps three.js out of the initial bundle).
  useEffect(() => {
    if (!use3d || !canvasRef.current) return;
    let disposed = false;
    void import('./hero3d-scene.js').then(({ createHeroScene }) => {
      if (disposed || !canvasRef.current) return;
      sceneRef.current = createHeroScene(canvasRef.current, { mascotUrl, theme });
    });
    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use3d]);

  useEffect(() => { sceneRef.current?.setProgress(progress); }, [progress]);
  useEffect(() => { sceneRef.current?.setTheme(theme); }, [theme]);

  if (!use3d) return <Hero inviteUrl={inviteUrl} guilds={guilds} />;

  const socialKey =
    lang === 'ar' && new Intl.PluralRules('ar').select(guilds) === 'few'
      ? 'landing.social.few'
      : 'landing.social';
  const chaosOpacity = 1 - smoothstep(0.12, 0.45, progress);
  const orderOpacity = smoothstep(0.62, 0.9, progress);

  return (
    // Tall track: the sticky stage is pinned for 3 viewport-heights of scroll.
    <section ref={trackRef} className="relative h-[300vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* Real HTML overlay — indexed by crawlers, translated, clickable. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {/* Beat 1 — chaos */}
          <div className="absolute max-w-2xl" style={{ opacity: chaosOpacity }}>
            <h1 className="text-4xl font-extrabold leading-tight text-slate-100 md:text-6xl">
              {t('hero3d.chaos.title')}
            </h1>
            <p className="mt-4 text-lg text-slate-300">{t('hero3d.chaos.sub')}</p>
          </div>

          {/* Beat 2 — order + CTA */}
          <div
            className="absolute max-w-2xl"
            style={{ opacity: orderOpacity, pointerEvents: orderOpacity > 0.5 ? 'auto' : 'none' }}
          >
            <h1 className="hero-title mb-4 text-4xl font-extrabold leading-tight md:text-6xl">
              {t('landing.title')}
            </h1>
            <p className="mb-7 text-lg text-slate-300">{t('landing.tagline')}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={inviteUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-400 px-7 py-3.5 font-semibold text-slate-950 transition hover:opacity-90"
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
              <p className="mt-5 text-sm font-semibold text-blue-300/90">
                <Zap className="inline h-4 w-4 align-[-2px]" /> {t(socialKey).replace('{count}', String(guilds))}
              </p>
            )}
          </div>
        </div>

        {/* Scroll hint (fades once the user starts) */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center text-xs font-semibold uppercase tracking-widest text-slate-400"
          style={{ opacity: 1 - smoothstep(0, 0.1, progress) }}
        >
          {t('hero3d.scrollHint')} ↓
        </div>
      </div>
    </section>
  );
}
