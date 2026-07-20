import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { useI18n } from '../../i18n.js';
import { scrollProgress, smoothstep } from '../../hooks/use-scroll-progress.js';
import { DiscordIcon } from './icons.js';
import heroBg from '../../assets/hero-bg.webp';

// The hero background is an ambient, autoplaying loop (assets/hero.mp4) that
// plays normally while scrolling drives a professional reveal: first the hero
// copy rises in line by line, then a sequence of meaningful "beats" cycles
// through over the video. With no video it falls back to numbered image frames
// that crossfade (hero-1.webp … hero-N), and to the single hero-bg.webp with
// none of those. Drop the file into assets/ — it's picked up automatically.
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

// Storytelling beats that cycle in over the video as the user scrolls deeper.
// Each has an [in-start, in-end, out-start, out-end] window over scroll progress.
const BEATS = [
  { title: 'landing.hero.beat1.title', sub: 'landing.hero.beat1.sub', win: [0.34, 0.42, 0.5, 0.58] },
  { title: 'landing.hero.beat2.title', sub: 'landing.hero.beat2.sub', win: [0.56, 0.64, 0.72, 0.8] },
  { title: 'landing.hero.beat3.title', sub: 'landing.hero.beat3.sub', win: [0.78, 0.86, 0.97, 1.0] },
] as const;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Opacity of frame `i` at scroll progress `p`, for an N-frame stack painted
// bottom-to-top. Frame 0 is the always-opaque base; each higher frame fades IN
// over its own scroll segment and covers the ones below — the film "advances".
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
  const revealRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const socialRef = useRef<HTMLParagraphElement>(null);
  const beatsRef = useRef<HTMLDivElement[]>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [interactive] = useState(() => !reducedMotion());

  // Kick the ambient video into playing immediately (muted inline playback is
  // allowed, so autoplay should work — this covers browsers that ignore the
  // attribute until the element is ready). play() may return undefined under
  // jsdom, so it is guarded.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      const r = v.play();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    };
    tryPlay();
    v.addEventListener('canplay', tryPlay);
    return () => v.removeEventListener('canplay', tryPlay);
  }, []);

  useEffect(() => {
    if (!interactive) return;
    const track = trackRef.current;
    if (!track) return;
    let mx = 0, my = 0, p = 0, raf = 0;

    // Reveal one copy element over its own [a,b] slice of scroll, rising `dist`px
    // into place — the "text appears as you scroll" beat.
    const reveal = (el: HTMLElement | null, a: number, b: number, dist: number) => {
      if (!el) return;
      const r = smoothstep(a, b, p);
      el.style.opacity = String(r);
      el.style.transform = `translateY(${(1 - r) * dist}px)`;
    };

    const apply = () => {
      raf = 0;
      // Gentle cinematic push-in on the ambient video + subtle mouse tilt.
      const scale = 1.06 + smoothstep(0, 1, p) * 0.16;
      if (bgRef.current) {
        bgRef.current.style.transform = `scale(${scale}) translate3d(${mx * -16}px, ${my * -16}px, 0)`;
        bgRef.current.style.filter = HERO_VIDEO ? 'none' : `blur(${(1 - smoothstep(0, 0.4, p)) * 3}px)`;
      }
      if (!HERO_VIDEO) {
        const n = layersRef.current.length;
        for (let i = 0; i < n; i++) {
          const layer = layersRef.current[i];
          if (layer) layer.style.opacity = String(frameOpacity(i, n, p));
        }
      }
      // Dark veil lifts as the copy reveals: moody at the top, open once scrolling.
      if (revealRef.current) revealRef.current.style.opacity = String((1 - smoothstep(0, 0.4, p)) * 0.45 + 0.12);
      // Wrapper carries only the mouse tilt; the per-line reveal does the entrance.
      if (contentRef.current) contentRef.current.style.transform = `translate3d(${mx * 10}px, ${my * 10}px, 0)`;

      // Hero copy rises in early and stays: badge → title → tagline → CTAs → proof.
      reveal(badgeRef.current, 0.02, 0.12, 20);
      // Title additionally focus-blurs in for a premium feel.
      if (titleRef.current) {
        const r = smoothstep(0.06, 0.2, p);
        titleRef.current.style.opacity = String(r);
        titleRef.current.style.transform = `translateY(${(1 - r) * 26}px)`;
        titleRef.current.style.filter = `blur(${(1 - r) * 9}px)`;
      }
      reveal(taglineRef.current, 0.12, 0.26, 22);
      reveal(ctaRef.current, 0.18, 0.3, 22);
      reveal(socialRef.current, 0.2, 0.32, 20);

      // Meaningful beats cycle in over the video as the user scrolls deeper.
      for (let i = 0; i < BEATS.length; i++) {
        const el = beatsRef.current[i];
        if (!el) continue;
        const [is, ie, os, oe] = BEATS[i].win;
        const enter = smoothstep(is, ie, p);
        const exit = smoothstep(os, oe, p);
        el.style.opacity = String(enter * (1 - exit));
        el.style.transform = `translateY(${(1 - enter) * 34 - exit * 22}px) scale(${0.96 + enter * 0.04})`;
      }

      // Slim scroll-progress indicator fills as you move through the hero.
      if (progressRef.current) progressRef.current.style.transform = `scaleY(${p})`;
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
    // Tall track: the stage is pinned across three viewports of scroll, over
    // which the copy reveals and the story beats cycle, then it releases.
    <section ref={trackRef} className="relative h-[300vh]">
      <div ref={stageRef} className="sticky top-0 flex h-screen items-center overflow-hidden">
        {/* Ambient background: the playing video (or image-frame fallback). */}
        <div
          ref={bgRef}
          className="absolute inset-0 origin-left will-change-transform md:origin-center"
          style={{ transform: 'scale(1.06)' }}
        >
          {HERO_VIDEO ? (
            <video
              ref={videoRef}
              src={HERO_VIDEO}
              // Ambient background playback: autoplay+loop, muted+playsInline are
              // mandatory for autoplay/inline on iOS; poster paints instantly (LCP).
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster={heroBg}
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
                fetchPriority={i === 0 ? 'high' : 'low'}
                className="absolute inset-0 h-full w-full object-cover object-left will-change-[opacity] md:object-center"
                style={{ opacity: interactive ? (i === 0 ? 1 : 0) : 1 }}
              />
            ))
          )}
        </div>

        {/* Dark veil that lifts on scroll (the "reveal") */}
        <div ref={revealRef} className="absolute inset-0 bg-slate-950" style={{ opacity: 0.45 }} />
        {/* Readability scrims: bottom + the RIGHT side where the text lives */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-l from-slate-950/90 via-slate-950/30 to-transparent" />

        {/* Slim scroll-progress indicator on the leading edge */}
        {interactive && (
          <div className="pointer-events-none absolute inset-y-0 start-4 z-10 my-auto hidden h-40 w-[3px] overflow-hidden rounded-full bg-white/10 md:block">
            <div
              ref={progressRef}
              className="h-full w-full origin-top rounded-full bg-gradient-to-b from-blue-400 to-blue-500 will-change-transform"
              style={{ transform: 'scaleY(0)' }}
            />
          </div>
        )}

        {/* Text overlay — real HTML, pinned RIGHT so it never covers the bot */}
        <div ref={contentRef} className="relative z-10 mx-auto w-full max-w-6xl px-6 will-change-transform">
          <div className="ml-auto max-w-xl text-center md:text-start">
            <span
              ref={badgeRef}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1.5 text-sm font-semibold text-blue-200 backdrop-blur will-change-transform"
              style={interactive ? { opacity: 0 } : undefined}
            >
              {t('landing.badge')}
            </span>
            {/* leading + vertical padding give Arabic ascenders/descenders room
                so the gradient-text clip (background-clip:text) never crops them. */}
            <h1
              ref={titleRef}
              className="hero-title mb-5 py-1 text-4xl font-extrabold leading-[1.28] will-change-transform md:text-5xl lg:text-6xl"
              style={interactive ? { opacity: 0 } : undefined}
            >
              {t('landing.title')}
            </h1>
            <p ref={taglineRef} className="mb-7 text-lg text-slate-200 will-change-transform" style={interactive ? { opacity: 0 } : undefined}>
              {t('landing.tagline')}
            </p>
            <div
              ref={ctaRef}
              className="flex flex-wrap items-center justify-center gap-3 will-change-transform md:justify-start"
              style={interactive ? { opacity: 0 } : undefined}
            >
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
              <p
                ref={socialRef}
                className="mt-5 text-sm font-semibold text-blue-300 will-change-transform"
                style={interactive ? { opacity: 0 } : undefined}
              >
                <Zap className="inline h-4 w-4 align-[-2px]" /> {t(socialKey).replace('{count}', String(guilds))}
              </p>
            )}

            {/* Cycling story beats — meaningful lines that reveal as you scroll on.
                Interactive only: they crossfade in a shared slot, so without the
                scroll driver they'd overlap. */}
            {interactive && (
              <div className="relative mt-8 min-h-[6rem]">
                {BEATS.map((b, i) => (
                  <div
                    key={b.title}
                    ref={(el) => {
                      if (el) beatsRef.current[i] = el;
                    }}
                    className="absolute inset-x-0 flex items-start gap-3 will-change-transform"
                    style={{ opacity: 0 }}
                  >
                    <span className="mt-1 h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-400 to-blue-500 shadow-[0_0_16px_-2px_rgba(59,130,246,0.9)]" />
                    <div className="text-start">
                      <p className="text-lg font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] md:text-xl">
                        {t(b.title)}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">{t(b.sub)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
