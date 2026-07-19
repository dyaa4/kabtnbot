# 3D scroll-telling hero — Design

**Date:** 2026-07-20 · **Status:** approved by owner ("let's try it, revert if
disliked")

## Concept

A pinned hero section at the top of the landing page tells a story as the user
scrolls (progress 0→1), built from code-generated Three.js geometry in the
brand neon palette (no external 3D/art assets):

- **0–30% chaos:** a neon Discord "room" — tilted channel panels, scattered
  jittering message bubbles, red notification dots. Headline: server is chaos.
- **30–60% orbit:** the camera rotates 3D around the room (the real look-around).
- **60–85% bot arrives:** the Kabtn mascot (existing image) flies in, glowing.
- **85–100% order:** bubbles snap into calm rows, red dots fade, and the
  invite / login CTAs + guild-count social proof appear, then the section
  releases into the normal landing.

## Architecture

- `landing/Hero3D.tsx` — the pinned section: a tall scroll track with a
  `sticky` full-viewport stage holding a `<canvas>` and an HTML overlay
  (headline per beat, CTA buttons, social proof). Owns the fallback decision.
- `landing/hero3d-scene.ts` — the Three.js scene, **dynamically imported**
  (`import()`) so three.js never enters the initial bundle. Exports
  `createHeroScene(canvas, opts)` → `{ setProgress(p), setTheme(t), dispose() }`.
- `hooks/use-scroll-progress.ts` — maps window scroll over the pinned track to
  0→1. The math is a pure exported `scrollProgress(trackTop, trackHeight,
  viewportH)` so it is unit-testable without a DOM.
- Scroll driving uses a plain sticky container + rAF-throttled scroll listener
  — **no GSAP / no scroll library** (bundle discipline).

## Fallback (mandatory)

When WebGL is unavailable, `prefers-reduced-motion: reduce` is set, or the
viewport is small (mobile), `Hero3D` renders the existing `<Hero>` component
instead of the interactive scene. This keeps the current hero as a graceful
degrade, preserves the guild-count social proof + mascot, and makes the
jsdom test path (no WebGL) render the static hero.

## SEO / i18n

Headlines and CTAs are real HTML in the overlay (never inside the canvas), so
crawlers index them and they stay translated in all six locales. New
`hero3d.*` headline keys per beat.

## Integration

`Landing.tsx` swaps `<Hero>` for `<Hero3D>` (same `inviteUrl` / `guilds`
props). The rest of the landing (features, pricing, faq, cta, footer) is
unchanged. `three` is added to apps/web dependencies (loaded only via the
dynamic import for capable clients).

## Testing

- `scrollProgress` pure-function unit tests (before/within/after the track).
- Hero3D fallback test: in jsdom (no WebGL) it renders the static `<Hero>` →
  existing Landing assertions (social proof) keep passing.
- The interactive 3D scene is verified manually (not unit-tested).

## Risk

Performance is the one real risk — mitigated by the dynamic import (three.js
off the critical path), the static fallback, and rAF throttling. Contained to
the hero; no other surface touched. Easy to revert (single feature commit).
