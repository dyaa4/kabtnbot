import { describe, it, expect } from 'vitest';
import { scrollProgress } from './use-scroll-progress.js';

describe('scrollProgress', () => {
  const H = 3000; // track height
  const V = 1000; // viewport
  // scrollable = 2000

  it('is 0 before the track pins (top still below the viewport top)', () => {
    expect(scrollProgress(500, H, V)).toBe(0);
    expect(scrollProgress(0, H, V)).toBe(0);
  });

  it('is 0.5 at the midpoint of the pinned scroll', () => {
    expect(scrollProgress(-1000, H, V)).toBeCloseTo(0.5, 5);
  });

  it('is 1 at (and past) the end of the track', () => {
    expect(scrollProgress(-2000, H, V)).toBe(1);
    expect(scrollProgress(-9999, H, V)).toBe(1);
  });

  it('degenerate track (not taller than the viewport) clamps sensibly', () => {
    expect(scrollProgress(10, 800, 1000)).toBe(0); // still below
    expect(scrollProgress(-1, 800, 1000)).toBe(1); // reached
  });
});
