/**
 * Progress (0→1) of scrolling through a pinned "track" element. 0 is when the
 * track's top reaches the top of the viewport; 1 is when its bottom does. The
 * usable scroll distance is (trackHeight − viewportHeight) because the sticky
 * stage occupies one viewport of that height. Pure so it can be unit-tested.
 */
export function scrollProgress(trackTop: number, trackHeight: number, viewportH: number): number {
  const scrollable = trackHeight - viewportH;
  if (scrollable <= 0) return trackTop <= 0 ? 1 : 0;
  const p = -trackTop / scrollable;
  // `<= 0` also normalizes -0 (from trackTop === 0) to a clean +0.
  return p <= 0 ? 0 : p > 1 ? 1 : p;
}

/** Smoothstep easing in [a,b]. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
