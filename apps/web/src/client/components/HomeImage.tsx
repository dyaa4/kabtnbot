import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n.js';
import homeImage from '../assets/home-image.png';

const LERP = 0.1;
const MAX_RY = 24; // deg, horizontal tilt toward cursor
const MAX_RX = 16; // deg, vertical tilt toward cursor
const MAX_SHADOW = 30; // px, ground shadow shift (opposite the tilt)
const POP_Z = 60; // px, how far the image floats in front of its glow

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * HomeImage — the Kabtn hero image with a real depth stack: the glow sits
 * BEHIND the tilt plane and the image pops toward the viewer (translateZ), so
 * tilting produces true parallax instead of a flat rotation. A specular glare
 * masked to the mascot's own silhouette sweeps across it following the
 * cursor, and the ground shadow shifts/stretches opposite the tilt.
 * Respects prefers-reduced-motion.
 */
export function HomeImage({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  const reduceMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  useEffect(() => {
    if (reduceMotion) return;

    const target = { dx: 0, dy: 0 };
    const current = { rx: 0, ry: 0, sx: 0, sy: 0, gx: 0, gy: 0 };
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
      current.sy += (-target.dy * (MAX_SHADOW / 2) - current.sy) * LERP;
      current.gx += (target.dx * 45 - current.gx) * LERP;
      current.gy += (target.dy * 45 - current.gy) * LERP;

      const intensity = Math.min(1, (Math.abs(current.ry) / MAX_RY + Math.abs(current.rx) / MAX_RX) / 2);

      if (cardRef.current) {
        cardRef.current.style.transform =
          `rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg) scale(${(1 + intensity * 0.03).toFixed(3)})`;
      }
      if (glowRef.current) {
        // The glow drifts WITH the cursor while the image tilts toward it —
        // opposite apparent motion = parallax depth.
        glowRef.current.style.transform =
          `translate(${(current.ry * 2).toFixed(2)}px, ${(-current.rx * 2).toFixed(2)}px) translateZ(-${POP_Z}px)`;
      }
      if (glareRef.current) {
        // Specular sweep, masked to the mascot silhouette; brighter with tilt.
        glareRef.current.style.opacity = (0.12 + intensity * 0.4).toFixed(3);
        glareRef.current.style.backgroundPosition = `${(50 + current.gx).toFixed(1)}% ${(50 + current.gy).toFixed(1)}%`;
      }
      if (shadowRef.current) {
        shadowRef.current.style.transform =
          `translate(calc(-50% + ${current.sx.toFixed(2)}px), ${current.sy.toFixed(2)}px) scaleX(${(1 - intensity * 0.25).toFixed(3)})`;
        shadowRef.current.style.opacity = (0.5 - intensity * 0.15).toFixed(3);
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

  // The glare layer is masked with the image itself so the light sweep hugs
  // the robot's silhouette instead of forming a rectangle over transparency.
  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: `url(${homeImage})`,
    maskImage: `url(${homeImage})`,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };

  return (
    <div
      ref={wrapRef}
      className={`kabtn-home relative ${className}`}
      style={{ perspective: '750px' }}
      role="img"
      aria-label={t('mascotAlt')}
    >
      {/* floating wrapper (idle bob), independent of the 3D tilt */}
      <div className={reduceMotion ? '' : 'animate-float'} style={{ transformStyle: 'preserve-3d' }}>
        <div ref={cardRef} style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}>
          {/* neon halo BEHIND the tilt plane — parallax layer */}
          <div
            ref={glowRef}
            className="pointer-events-none absolute inset-x-2 inset-y-6 -z-10 rounded-[50%] bg-gradient-to-br from-blue-500/50 via-blue-500/35 to-blue-400/50 blur-3xl"
            aria-hidden="true"
          />
          {/* the image pops toward the viewer; slight contrast/saturation lift
              keeps the downscaled PNG looking crisp instead of washed out */}
          <img
            src={homeImage}
            alt=""
            aria-hidden="true"
            decoding="async"
            className="block h-auto w-full select-none [filter:contrast(1.07)_saturate(1.1)_drop-shadow(0_26px_48px_rgba(59,130,246,0.5))_drop-shadow(0_0_16px_rgba(59,130,246,0.35))]"
            style={{ transform: `translateZ(${POP_Z}px)` }}
            draggable={false}
          />
          {/* cursor-following specular glare, clipped to the mascot */}
          <div
            ref={glareRef}
            className="pointer-events-none absolute inset-0"
            style={{
              ...maskStyle,
              transform: `translateZ(${POP_Z + 1}px)`,
              background:
                'radial-gradient(42% 30% at 50% 50%, rgba(255,255,255,0.9), rgba(147,197,253,0.35) 45%, transparent 70%)',
              backgroundSize: '220% 220%',
              backgroundPosition: '50% 50%',
              mixBlendMode: 'soft-light',
              opacity: 0.12,
            }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* ground shadow that drifts and squashes opposite the tilt */}
      <div
        ref={shadowRef}
        className="pointer-events-none absolute -bottom-4 left-1/2 h-6 w-2/3 -translate-x-1/2 rounded-[50%] bg-black/50 blur-2xl"
        aria-hidden="true"
      />
    </div>
  );
}
