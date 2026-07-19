import { useEffect, useRef, useState } from 'react';

/**
 * Progress (0→1) of scrolling through a pinned "track" element. 0 is when the
 * track's top reaches the top of the viewport; 1 is when its bottom does. The
 * usable scroll distance is (trackHeight − viewportHeight) because the sticky
 * stage occupies one viewport of that height.
 *
 * Pure so it can be unit-tested without a DOM.
 */
export function scrollProgress(trackTop: number, trackHeight: number, viewportH: number): number {
  const scrollable = trackHeight - viewportH;
  if (scrollable <= 0) return trackTop <= 0 ? 1 : 0;
  // trackTop is the element's top relative to the viewport (getBoundingClientRect).
  // It goes from +something (below) → 0 (pinned start) → −scrollable (pinned end).
  const p = -trackTop / scrollable;
  // `<= 0` also normalizes -0 (from trackTop === 0) to a clean +0.
  return p <= 0 ? 0 : p > 1 ? 1 : p;
}

/** Reactive scroll progress for the given track ref, rAF-throttled. */
export function useScrollProgress(ref: React.RefObject<HTMLElement>): number {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      raf.current = 0;
      const rect = el.getBoundingClientRect();
      setProgress(scrollProgress(rect.top, rect.height, window.innerHeight));
    };
    const onScroll = () => {
      if (raf.current) return; // coalesce to one update per frame
      raf.current = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [ref]);

  return progress;
}
