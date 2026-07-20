import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { useI18n } from '../../i18n.js';
import { scrollProgress, smoothstep } from '../../hooks/use-scroll-progress.js';
import { DiscordIcon } from './icons.js';
import heroBg from '../../assets/hero-bg.webp';

// The hero background is a scroll-scrubbed "film". Preferred source is an
// actual video (assets/hero.mp4) whose playhead is driven by scroll progress;
// with no video it falls back to numbered image frames (hero-1.webp … hero-N),
// and with none of those to the single hero-bg.webp. Drop the file into assets/
// and it's picked up automatically — no code change needed.
const videoMods = import.meta.glob('../../assets/hero.mp4', {
  eager: true,
  import: 'default',
});
const HERO_VIDEO: string | null = (Object.values(videoMods)[0] as string | undefined) ?? null;

const frameMods = import.meta.glob('../../assets/hero-*.webp', {
  eager: true,
  import: 'default',
});
const FRAMES: string[] = (() => {
  const seq = Object.entries(frameMods)
    .filter(([path]) => /\/hero-\d+\.webp$/.test(path))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, url]) => url as string);
  return seq.length ? seq : [heroBg];
})();

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Opacity of frame `i` at scroll progress `p`, for an N-frame stack painted
// bottom-to-top. Frame 0 is the always-opaque base (so the dark backdrop never
// bleeds through mid-crossfade); each higher frame fades IN over its own scroll
// segment and then stays, covering the ones below — the film "advances".
function frameOpacity(i: number, n: number, p: number): number {
  if (i === 0 || n <= 1) return 1;
  const step = 1 / (n - 1);
  return smoothstep((i - 1) * step, i * step, p);
}

export function HeroParallax({ inviteUrl, guilds }: { inviteUrl: string; guilds: number }) {
  const { t, lang } = useI18n();
  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLImageElement[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const durationRef = useRef(0);
  const revealRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [interactive] = useState(() => !reducedMotion());

  useEffect(() => {
    if (!interactive) return;
    const track = trackRef.current;
    if (!track) return;
    let mx = 0, my = 0, p = 0, raf = 0;

    const apply = () => {
      raf = 0;
      // Cinematic push-in (scale grows with scroll) + subtle mouse tilt.
      const scale = 1.08 + smoothstep(0, 1, p) * 0.34;
      if (bgRef.current) {
        bgRef.current.style.transform = `scale(${scale}) translate3d(${mx * -20}px, ${my * -20}px, 0)`;
        // Soft blur clears as the scene comes INTO FOCUS. Skipped for the video
        // path — a CSS blur filter during seeking is far too heavy to stay smooth.
        bgRef.current.style.filter = HERO_VIDEO ? 'none' : `blur(${(1 - smoothstep(0, 0.4, p)) * 3}px)`;
      }
      if (HERO_VIDEO) {
        // Scroll drives the playhead — linear so scroll distance maps 1:1 to the
        // footage. Stop a hair short of the end so it never wraps/pauses.
        const d = durationRef.current;
        if (videoRef.current && d > 0) {
          videoRef.current.currentTime = Math.min(p * d, d - 0.05);
        }
      } else {
        // Crossfade the image frames as the scroll advances.
        const n = layersRef.current.length;
        for (let i = 0; i < n; i++) {
          const layer = layersRef.current[i];
          if (layer) layer.style.opacity = String(frameOpacity(i, n, p));
        }
      }
      // The scene lights up as you scroll (dark veil clears).
      if (revealRef.current) revealRef.current.style.opacity = String((1 - smoothstep(0, 0.5, p)) * 0.55);
      // Content parallax-rises with the cursor; releases (fades) at the very end.
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${mx * 12}px, ${my * 12 - p * 60}px, 0)`;
        contentRef.current.style.opacity = String(1 - smoothstep(0.82, 1, p));
      }
      // Feature pills rise INTO view on scroll — the "something appears" beat.
      if (pillsRef.current) {
        const r = smoothstep(0.18, 0.55, p);
        pillsRef.current.style.opacity = String(r);
        pillsRef.current.style.transform = `translateY(${(1 - r) * 28}px)`;
      }
      if (hintRef.current) hintRef.current.style.opacity = String(1 - smoothstep(0, 0.12, p));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onMove = (e: PointerEvent) => {
      const r = (stageRef.current ?? track).getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;
      my = (e.clientY - r.top) / r.height - 0.5;
      schedule();
    };
    const onScroll = () => {
      const r = track.getBoundingClientRect();
      p = scrollProgress(r.top, r.height, window.innerHeight);
      schedule();
    };
    onScroll();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [interactive]);

  const socialKey =
    lang === 'ar' && new Intl.PluralRules('ar').select(guilds) === 'few'
      ? 'landing.social.few'
      : 'landing.social';

  return (
    // Tall track: the stage is pinned for one extra viewport of scroll, during
    // which the cinematic push-in / light-up / frame crossfade plays, then it
    // releases.
    <section ref={trackRef} className="relative h-[200vh]">
      <div ref={stageRef} className="sticky top-0 flex h-screen items-center overflow-hidden">
        {/* The film stack. origin-left on mobile so the push-in scale zooms FROM
            the left and never pushes the bot out of frame; centered on desktop
            where the whole 16:9 fits. */}
        <div
          ref={bgRef}
          className="absolute inset-0 origin-left will-change-transform md:origin-center"
          style={{ transform: 'scale(1.08)' }}
        >
          {HERO_VIDEO ? (
            <video
              ref={videoRef}
              src={HERO_VIDEO}
              // muted + playsInline are mandatory for iOS to decode/seek an inline
              // video; poster paints instantly (good LCP) before the video is ready.
              muted
              playsInline
              preload="auto"
              poster={heroBg}
              onLoadedMetadata={(e) => {
                durationRef.current = e.currentTarget.duration;
                if (typeof window !== 'undefined') window.dispatchEvent(new Event('scroll'));
              }}
              className="absolute inset-0 h-full w-full object-cover object-left md:object-center"
            />
          ) : (
            FRAMES.map((src, i) => (
              <img
                key={src}
                ref={(el) => {
                  if (el) layersRef.current[i] = el;
                }}
                src={src}
                alt=""
                // Only the first frame matters for LCP; it is the always-visible base.
                fetchPriority={i === 0 ? 'high' : 'low'}
                className="absolute inset-0 h-full w-full object-cover object-left will-change-[opacity] md:object-center"
                // Base frame opaque; higher frames start hidden and crossfade in on
                // scroll. Without JS (reduced motion) every frame shows, so the last
                // (resolved) frame wins.
                style={{ opacity: interactive ? (i === 0 ? 1 : 0) : 1 }}
              />
            ))
          )}
        </div>

        {/* Dark veil that clears on scroll (the "reveal") */}
        <div ref={revealRef} className="absolute inset-0 bg-slate-950" style={{ opacity: 0.4 }} />
        {/* Readability scrims: bottom + the RIGHT side where the text lives */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-l from-slate-950/90 via-slate-950/30 to-transparent" />

        {/* Text overlay — real HTML, pinned RIGHT so it never covers the bot */}
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

            {/* Revealed on scroll (the effect) — quick feature pills rise in. */}
            <div
              ref={pillsRef}
              className="mt-6 flex flex-wrap justify-center gap-2 will-change-transform md:justify-start"
              style={interactive ? { opacity: 0 } : undefined}
            >
              {(['voice', 'protection', 'automation'] as const).map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur"
                >
                  {t(`landing.feature.${k}.title`)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll hint — fades once the user starts */}
        <div
          ref={hintRef}
          className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center text-xs font-semibold uppercase tracking-widest text-slate-300"
        >
          {t('hero.scrollHint')} ↓
        </div>
      </div>
    </section>
  );
}
