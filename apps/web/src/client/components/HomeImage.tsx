import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n.js';
import homeImage from '../assets/home-image.png';

const LERP = 0.08;
const MAX_RY = 16; // deg, horizontal tilt toward cursor
const MAX_RX = 12; // deg, vertical tilt toward cursor
const MAX_SHADOW = 22; // px, ground shadow shift (opposite the tilt)

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * HomeImage — the Kabtn hero image (home-image.png) rendered with a soft 3D
 * tilt that follows the cursor, a neon glow, a floating idle animation and a
 * ground shadow that drifts opposite the tilt. Respects prefers-reduced-motion.
 */
export function HomeImage({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  const reduceMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  useEffect(() => {
    if (reduceMotion) return;

    const target = { dx: 0, dy: 0 };
    const current = { rx: 0, ry: 0, sx: 0, sy: 0 };
    let rafId = 0;

    function handleMouseMove(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      target.dx = clamp((e.clientX - cx) / (rect.width / 2), -1, 1);
      target.dy = clamp((e.clientY - cy) / (rect.height / 2), -1, 1);
    }

    function tick() {
      current.ry += (target.dx * MAX_RY - current.ry) * LERP;
      current.rx += (-target.dy * MAX_RX - current.rx) * LERP;
      current.sx += (-target.dx * MAX_SHADOW - current.sx) * LERP;
      current.sy += (-target.dy * MAX_SHADOW - current.sy) * LERP;

      if (cardRef.current) {
        cardRef.current.style.transform = `rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg)`;
      }
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${(current.ry * 1.2).toFixed(2)}px, ${(-current.rx * 1.2).toFixed(2)}px)`;
      }
      if (shadowRef.current) {
        shadowRef.current.style.transform = `translate(${current.sx.toFixed(2)}px, ${current.sy.toFixed(2)}px)`;
      }

      rafId = requestAnimationFrame(tick);
    }

    window.addEventListener('mousemove', handleMouseMove);
    rafId = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, [reduceMotion]);

  return (
    <div
      ref={wrapRef}
      className={`kabtn-home relative ${className}`}
      style={{ perspective: '900px' }}
      role="img"
      aria-label={t('mascotAlt')}
    >
      {/* soft neon glow behind the transparent image — a radial halo, not a panel */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute inset-x-4 inset-y-8 -z-10 rounded-[50%] bg-gradient-to-br from-indigo-500/35 via-violet-500/25 to-cyan-400/35 blur-3xl"
        aria-hidden="true"
      />

      {/* floating wrapper (idle bob), independent of the 3D tilt */}
      <div className={reduceMotion ? '' : 'animate-float'} style={{ transformStyle: 'preserve-3d' }}>
        {/* no border, no panel, no background — only the transparent PNG with a depth drop-shadow */}
        <div ref={cardRef} style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}>
          <img
            src={homeImage}
            alt=""
            aria-hidden="true"
            className="block h-auto w-full select-none [filter:drop-shadow(0_18px_35px_rgba(34,211,238,0.35))]"
            draggable={false}
          />
        </div>
      </div>

      {/* ground shadow that drifts opposite the tilt */}
      <div
        ref={shadowRef}
        className="pointer-events-none absolute -bottom-4 left-1/2 h-6 w-2/3 -translate-x-1/2 rounded-[50%] bg-black/45 blur-2xl"
        aria-hidden="true"
      />
    </div>
  );
}
