import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n.js';

/**
 * KabtnBot — the Kabtn captain-robot mascot.
 *
 * Rendered as layered, depth-sorted inline SVGs composited with CSS 3D
 * (`perspective` + `transform-style: preserve-3d`, no WebGL/canvas). Each
 * body part sits on its own `translateZ` plane so that rotating the group
 * produces real parallax between the cap, visor, head and body.
 *
 * The robot turns to face the mouse cursor anywhere on the page: a single
 * `window` "mousemove" listener (registered/cleaned up in a `useEffect`)
 * records a normalized target direction, and a `requestAnimationFrame` loop
 * lerps the current rotation toward that target and writes the result
 * straight to element `style`/`transform` attributes via refs. No React
 * state is touched on mousemove or per animation frame, keeping the hot
 * path allocation-free.
 */

const MAX_HEAD_RY = 22; // deg — head yaw toward the cursor
const MAX_HEAD_RX = 12; // deg — head pitch toward the cursor
const MAX_BODY_RY = 8; // deg — torso softly follows the head's yaw
const MAX_BODY_RX = 5; // deg — torso softly follows the head's pitch
const MAX_PUPIL = 3; // svg user-units — pupil drift inside the visor
const MAX_SHADOW_SHIFT_X = 10; // px — ground shadow counter-shifts opposite the head
const MAX_SHADOW_SHIFT_Y = 4; // px
const LERP = 0.08;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Shared gradients/filters referenced by every layer via url(#id). */
function KabtnDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kb-metal-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="45%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0b1220" />
        </linearGradient>
        <linearGradient id="kb-metal-head" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#aab4c8" />
          <stop offset="42%" stopColor="#475569" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="kb-visor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#16233a" />
          <stop offset="100%" stopColor="#040810" />
        </linearGradient>
        <linearGradient id="kb-cap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b93f8" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#372f9e" />
        </linearGradient>
        <linearGradient id="kb-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8af1ff" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <radialGradient id="kb-eye" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="45%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0e7490" />
        </radialGradient>
        <radialGradient id="kb-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kb-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#020617" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="kb-specular" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#e0f7ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="kb-blur-rim" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id="kb-blur-soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="kb-blur-shadow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <clipPath id="kb-visor-clip">
          <rect x="72" y="104" width="96" height="48" rx="20" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Absolutely-positioned layer wrapper — one plane of the 3D scene. */
function Layer({
  innerRef,
  z,
  children,
}: {
  innerRef: React.Ref<HTMLDivElement>;
  z: number;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={innerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        transform: `translateZ(${z}px)`,
        transformStyle: 'preserve-3d',
      }}
    >
      <svg viewBox="0 0 240 260" width="100%" height="100%" style={{ overflow: 'visible' }} focusable="false" aria-hidden="true">
        {children}
      </svg>
    </div>
  );
}

export function KabtnBot({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const visorRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const antennaRef = useRef<HTMLDivElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  const reduceMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  useEffect(() => {
    if (reduceMotion) return;

    const target = { dx: 0, dy: 0 };
    const current = {
      headRX: 0,
      headRY: 0,
      bodyRX: 0,
      bodyRY: 0,
      pupilX: 0,
      pupilY: 0,
      shadowX: 0,
      shadowY: 0,
    };
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
      current.headRY += (target.dx * MAX_HEAD_RY - current.headRY) * LERP;
      current.headRX += (target.dy * MAX_HEAD_RX - current.headRX) * LERP;
      current.bodyRY += (target.dx * MAX_BODY_RY - current.bodyRY) * LERP;
      current.bodyRX += (target.dy * MAX_BODY_RX - current.bodyRX) * LERP;
      current.pupilX += (target.dx * MAX_PUPIL - current.pupilX) * LERP;
      current.pupilY += (target.dy * MAX_PUPIL - current.pupilY) * LERP;
      current.shadowX += (-target.dx * MAX_SHADOW_SHIFT_X - current.shadowX) * LERP;
      current.shadowY += (-target.dy * MAX_SHADOW_SHIFT_Y - current.shadowY) * LERP;

      const headT = `rotateX(${current.headRX.toFixed(2)}deg) rotateY(${current.headRY.toFixed(2)}deg)`;
      const bodyT = `rotateX(${current.bodyRX.toFixed(2)}deg) rotateY(${current.bodyRY.toFixed(2)}deg)`;

      if (headRef.current) headRef.current.style.transform = `${headT} translateZ(0px)`;
      if (visorRef.current) visorRef.current.style.transform = `${headT} translateZ(14px)`;
      if (capRef.current) capRef.current.style.transform = `${headT} translateZ(22px)`;
      if (antennaRef.current) antennaRef.current.style.transform = `${headT} translateZ(28px)`;
      if (bodyRef.current) bodyRef.current.style.transform = `${bodyT} translateZ(-10px)`;
      if (glowRef.current) glowRef.current.style.transform = `${bodyT} translateZ(-40px)`;
      if (pupilsRef.current) {
        pupilsRef.current.setAttribute('transform', `translate(${current.pupilX.toFixed(2)} ${current.pupilY.toFixed(2)})`);
      }
      if (shadowRef.current) {
        shadowRef.current.style.transform = `translate(${current.shadowX.toFixed(2)}px, ${current.shadowY.toFixed(2)}px)`;
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
      role="img"
      aria-label={t('mascotAlt')}
      className={`relative ${reduceMotion ? '' : 'animate-float'} ${className}`}
      style={{
        aspectRatio: '240 / 260',
        filter: 'drop-shadow(0 0 24px rgba(99,102,241,0.45)) drop-shadow(0 0 12px rgba(34,211,238,0.35))',
      }}
    >
      <style>{`
        @keyframes kabtn-shadow-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(0.8); opacity: 0.32; }
        }
        .kabtn-shadow-pulse {
          animation: kabtn-shadow-pulse 5s ease-in-out infinite;
          transform-origin: center;
        }
        @keyframes kabtn-antenna-glow {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 2px rgba(103,232,249,0.9)); }
          50% { opacity: 0.55; filter: drop-shadow(0 0 9px rgba(103,232,249,1)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .kabtn-antenna-glow, .kabtn-shadow-pulse, .animate-float { animation: none !important; }
        }
      `}</style>
      <KabtnDefs />

      {/* ground contact shadow — flat, outside the 3D stage, counter-shifts vs. head rotation */}
      <div style={{ position: 'absolute', left: '50%', bottom: '-3%', width: '74%', height: '18%', transform: 'translateX(-50%)' }}>
        <div ref={shadowRef} style={{ width: '100%', height: '100%' }}>
          <div className="kabtn-shadow-pulse" style={{ width: '100%', height: '100%' }}>
            <svg viewBox="0 0 200 60" width="100%" height="100%" focusable="false" aria-hidden="true">
              <ellipse cx="100" cy="30" rx="90" ry="22" fill="url(#kb-shadow)" filter="url(#kb-blur-shadow)" />
            </svg>
          </div>
        </div>
      </div>

      {/* 3D stage: perspective on the scene, preserve-3d on the stage, per-part translateZ planes below */}
      <div style={{ position: 'relative', width: '100%', height: '100%', perspective: '900px' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d' }}>
          {/* back glow disc — z -40 */}
          <Layer innerRef={glowRef} z={-40}>
            <circle cx="120" cy="150" r="98" fill="url(#kb-glow)" />
          </Layer>

          {/* body / torso — z -10 */}
          <Layer innerRef={bodyRef} z={-10}>
            {/* rim light behind torso silhouette */}
            <rect x="68" y="190" width="104" height="66" rx="24" fill="none" stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="5" filter="url(#kb-blur-rim)" />
            <rect x="104" y="178" width="32" height="14" fill="#334155" />
            <rect x="70" y="192" width="100" height="62" rx="22" fill="url(#kb-metal-body)" stroke="#1e293b" strokeWidth="3" />
            <line x1="70" y1="214" x2="170" y2="214" stroke="#6366f1" strokeOpacity="0.4" strokeWidth="2" />
            {/* chest badge, embossed ك */}
            <circle cx="120" cy="228" r="18" fill="url(#kb-badge)" stroke="#0e7490" strokeWidth="2" />
            <circle cx="120" cy="228" r="18" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
            <text x="120" y="236" textAnchor="middle" fontSize="18" fontWeight="900" fill="#020617" opacity="0.55">
              ك
            </text>
            <text x="119" y="234.5" textAnchor="middle" fontSize="18" fontWeight="900" fill="#e0f7ff" opacity="0.5">
              ك
            </text>
            <text x="120" y="235" textAnchor="middle" fontSize="18" fontWeight="900" fill="#0b1220">
              ك
            </text>
            <circle cx="78" cy="204" r="4" fill="#22d3ee" />
            <circle cx="162" cy="204" r="4" fill="#22d3ee" />
          </Layer>

          {/* head shell — z 0 */}
          <Layer innerRef={headRef} z={0}>
            <rect x="55" y="82" width="130" height="96" rx="28" fill="none" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="5" filter="url(#kb-blur-rim)" />
            <rect x="55" y="82" width="130" height="96" rx="28" fill="url(#kb-metal-head)" stroke="#1e293b" strokeWidth="3" />
            {/* inner shadow cast by the cap brim */}
            <rect x="58" y="82" width="124" height="16" rx="10" fill="#020617" opacity="0.35" />
            <line x1="55" y1="118" x2="185" y2="118" stroke="#6366f1" strokeOpacity="0.5" strokeWidth="2" />
            <line x1="55" y1="150" x2="185" y2="150" stroke="#22d3ee" strokeOpacity="0.4" strokeWidth="2" />
            <circle cx="52" cy="128" r="10" fill="#334155" stroke="#1e293b" strokeWidth="2" />
            <circle cx="188" cy="128" r="10" fill="#334155" stroke="#1e293b" strokeWidth="2" />
          </Layer>

          {/* visor + eyes — z 14 */}
          <Layer innerRef={visorRef} z={14}>
            <rect x="72" y="104" width="96" height="48" rx="20" fill="url(#kb-visor)" stroke="#0891b2" strokeOpacity="0.6" strokeWidth="2" />
            {/* eye sockets (static) */}
            <circle cx="103" cy="128" r="14" fill="#04101d" />
            <circle cx="137" cy="128" r="14" fill="#04101d" />
            {/* pupils — translate toward the cursor */}
            <g ref={pupilsRef}>
              <circle cx="103" cy="128" r="11" fill="url(#kb-eye)" />
              <circle cx="137" cy="128" r="11" fill="url(#kb-eye)" />
              <circle cx="99" cy="124" r="2.4" fill="#ffffff" opacity="0.85" />
              <circle cx="133" cy="124" r="2.4" fill="#ffffff" opacity="0.85" />
            </g>
            {/* blink eyelids (static, layered above pupils) */}
            <rect x="90" y="120" width="26" height="16" rx="8" fill="#0b1220">
              {!reduceMotion && (
                <>
                  <animate attributeName="height" values="0;16;0" keyTimes="0;0.5;1" dur="4s" begin="1.2s" repeatCount="indefinite" />
                  <animate attributeName="y" values="128;120;128" keyTimes="0;0.5;1" dur="4s" begin="1.2s" repeatCount="indefinite" />
                </>
              )}
            </rect>
            <rect x="124" y="120" width="26" height="16" rx="8" fill="#0b1220">
              {!reduceMotion && (
                <>
                  <animate attributeName="height" values="0;16;0" keyTimes="0;0.5;1" dur="4s" begin="1.2s" repeatCount="indefinite" />
                  <animate attributeName="y" values="128;120;128" keyTimes="0;0.5;1" dur="4s" begin="1.2s" repeatCount="indefinite" />
                </>
              )}
            </rect>
            {/* glossy specular streak sweeping across the visor glass */}
            <g clipPath="url(#kb-visor-clip)">
              <g transform="skewX(-20)">
                <rect x="-60" y="90" width="34" height="90" fill="url(#kb-specular)">
                  {!reduceMotion && (
                    <animateTransform attributeName="transform" type="translate" values="-20 0; 260 0" keyTimes="0;1" dur="3.2s" repeatCount="indefinite" />
                  )}
                </rect>
              </g>
            </g>
          </Layer>

          {/* captain's cap — z 22 */}
          <Layer innerRef={capRef} z={22}>
            <path d="M62 58 Q120 20 178 58 L178 74 Q120 60 62 74 Z" fill="none" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="4" filter="url(#kb-blur-rim)" />
            <path d="M62 58 Q120 20 178 58 L178 74 Q120 60 62 74 Z" fill="url(#kb-cap)" stroke="#312e81" strokeWidth="2" />
            <rect x="58" y="70" width="124" height="14" rx="7" fill="#4338ca" stroke="#312e81" strokeWidth="2" />
            <path
              d="M120 42 L124 52 L135 52 L126 58 L129 68 L120 62 L111 68 L114 58 L105 52 L116 52 Z"
              fill="#fde68a"
              stroke="#b45309"
              strokeWidth="1"
            />
            <path d="M120 42 L124 52 L112 47 Z" fill="#fff7cc" opacity="0.6" />
          </Layer>

          {/* antenna tip — z 28 */}
          <Layer innerRef={antennaRef} z={28}>
            <line x1="120" y1="16" x2="120" y2="42" stroke="#475569" strokeWidth="4" />
            <circle cx="120" cy="12" r="8" fill="#67e8f9" style={{ animation: reduceMotion ? 'none' : 'kabtn-antenna-glow 2s ease-in-out infinite' }} />
          </Layer>
        </div>
      </div>
    </div>
  );
}
