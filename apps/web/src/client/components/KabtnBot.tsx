import { useRef, useState } from 'react';

/**
 * KabtnBot — the Kabtn captain-robot mascot.
 * Pure inline SVG (no external assets), with a floating idle animation,
 * a subtle glowing-eye blink, and a light 3D mouse-tilt on the wrapper.
 */
export function KabtnBot({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const reduceMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: py * -20, ry: px * 20 });
  }

  function onMouseLeave() {
    setTilt({ rx: 0, ry: 0 });
  }

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`${reduceMotion ? '' : 'animate-float'} ${className}`}
      style={{
        transform: `perspective(800px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: 'transform 200ms ease-out',
        filter: 'drop-shadow(0 0 24px rgba(99,102,241,0.45)) drop-shadow(0 0 12px rgba(34,211,238,0.35))',
      }}
    >
      <svg viewBox="0 0 240 260" width="100%" height="100%" role="img" aria-label="Kabtn robot mascot">
        <defs>
          <linearGradient id="kb-metal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="kb-visor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0b1220" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="kb-cap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#4338ca" />
          </linearGradient>
          <linearGradient id="kb-badge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <radialGradient id="kb-eye" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a5f3fc" />
            <stop offset="60%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </radialGradient>
        </defs>

        {/* antenna */}
        <line x1="120" y1="16" x2="120" y2="42" stroke="#475569" strokeWidth="4" />
        <circle cx="120" cy="12" r="8" fill="#22d3ee">
          <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* captain's cap */}
        <path d="M62 58 Q120 20 178 58 L178 74 Q120 60 62 74 Z" fill="url(#kb-cap)" stroke="#312e81" strokeWidth="2" />
        <rect x="58" y="70" width="124" height="14" rx="7" fill="#4338ca" stroke="#312e81" strokeWidth="2" />
        {/* cap star emblem */}
        <path
          d="M120 42 L124 52 L135 52 L126 58 L129 68 L120 62 L111 68 L114 58 L105 52 L116 52 Z"
          fill="#fde68a"
          stroke="#b45309"
          strokeWidth="1"
        />

        {/* head */}
        <rect x="55" y="82" width="130" height="96" rx="28" fill="url(#kb-metal)" stroke="#1e293b" strokeWidth="3" />
        {/* head accent lines */}
        <line x1="55" y1="118" x2="185" y2="118" stroke="#6366f1" strokeOpacity="0.5" strokeWidth="2" />
        <line x1="55" y1="150" x2="185" y2="150" stroke="#22d3ee" strokeOpacity="0.4" strokeWidth="2" />

        {/* visor */}
        <rect x="72" y="104" width="96" height="48" rx="20" fill="url(#kb-visor)" stroke="#0891b2" strokeOpacity="0.6" strokeWidth="2" />

        {/* eyes with blink */}
        <g>
          <circle cx="103" cy="128" r="11" fill="url(#kb-eye)" />
          <circle cx="137" cy="128" r="11" fill="url(#kb-eye)" />
          <rect x="90" y="120" width="26" height="16" rx="8" fill="#0b1220">
            <animate attributeName="height" values="0;16;0" keyTimes="0;0.5;1" dur="4s" begin="1.2s" repeatCount="indefinite" />
            <animate attributeName="y" values="128;120;128" keyTimes="0;0.5;1" dur="4s" begin="1.2s" repeatCount="indefinite" />
          </rect>
          <rect x="124" y="120" width="26" height="16" rx="8" fill="#0b1220">
            <animate attributeName="height" values="0;16;0" keyTimes="0;0.5;1" dur="4s" begin="1.2s" repeatCount="indefinite" />
            <animate attributeName="y" values="128;120;128" keyTimes="0;0.5;1" dur="4s" begin="1.2s" repeatCount="indefinite" />
          </rect>
        </g>

        {/* ear pods */}
        <circle cx="52" cy="128" r="10" fill="#334155" stroke="#1e293b" strokeWidth="2" />
        <circle cx="188" cy="128" r="10" fill="#334155" stroke="#1e293b" strokeWidth="2" />

        {/* neck */}
        <rect x="104" y="178" width="32" height="14" fill="#334155" />

        {/* torso */}
        <rect x="70" y="192" width="100" height="62" rx="22" fill="url(#kb-metal)" stroke="#1e293b" strokeWidth="3" />
        <line x1="70" y1="214" x2="170" y2="214" stroke="#6366f1" strokeOpacity="0.4" strokeWidth="2" />

        {/* chest badge with Arabic letter ك */}
        <circle cx="120" cy="228" r="18" fill="url(#kb-badge)" stroke="#0e7490" strokeWidth="2" />
        <text x="120" y="235" textAnchor="middle" fontSize="18" fontWeight="900" fill="#0b1220">
          ك
        </text>

        {/* shoulder lights */}
        <circle cx="78" cy="204" r="4" fill="#22d3ee" />
        <circle cx="162" cy="204" r="4" fill="#22d3ee" />
      </svg>
    </div>
  );
}
