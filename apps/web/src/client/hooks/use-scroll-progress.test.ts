import { describe, it, expect } from 'vitest';
import { scrollProgress, smoothstep } from './use-scroll-progress.js';

describe('scrollProgress', () => {
  const H = 3000; // track height
  const V = 1000; // viewport → scrollable = 2000

  it('is 0 before the track pins', () => {
    expect(scrollProgress(500, H, V)).toBe(0);
    expect(scrollProgress(0, H, V)).toBe(0); // and normalizes -0
  });
  it('is 0.5 at the midpoint', () => {
    expect(scrollProgress(-1000, H, V)).toBeCloseTo(0.5, 5);
  });
  it('is 1 at and past the end', () => {
    expect(scrollProgress(-2000, H, V)).toBe(1);
    expect(scrollProgress(-9999, H, V)).toBe(1);
  });
  it('clamps a degenerate (short) track', () => {
    expect(scrollProgress(10, 800, 1000)).toBe(0);
    expect(scrollProgress(-1, 800, 1000)).toBe(1);
  });
});

describe('smoothstep', () => {
  it('clamps and eases', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
    expect(smoothstep(0.2, 0.6, 0.4)).toBeCloseTo(0.5, 5);
  });
});
