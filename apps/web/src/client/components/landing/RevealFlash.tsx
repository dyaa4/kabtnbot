import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Plays a one-time twin light-sweep (from the left and right edges toward the
 * center) the first time the wrapped content scrolls into view — a polished
 * "reveal" for a section. Pure CSS animation; the observer only toggles a
 * class. Falls back to showing content immediately where IntersectionObserver
 * is unavailable (SSR/jsdom), and the sweep respects prefers-reduced-motion.
 */
export function RevealFlash({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('flash-in');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('flash-in');
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`flash-wrap relative ${className}`}>
      <span className="flash-beam flash-left" aria-hidden="true" />
      <span className="flash-beam flash-right" aria-hidden="true" />
      {children}
    </div>
  );
}
