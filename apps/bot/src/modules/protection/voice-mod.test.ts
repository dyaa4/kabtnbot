import { describe, it, expect } from 'vitest';
import { ProfanityTracker } from './voice-mod.js';

describe('ProfanityTracker', () => {
  it('warns first, kicks second within the hour, warns again after the window', () => {
    const t = new ProfanityTracker();
    const base = 1_000_000_000;
    expect(t.register('g', 'u', base)).toBe('warn');
    expect(t.register('g', 'u', base + 5 * 60_000)).toBe('kick'); // 5 min later
    // > 1h after the FIRST → window reset → warn again
    expect(t.register('g', 'u', base + 61 * 60_000)).toBe('warn');
  });
  it('tracks users independently', () => {
    const t = new ProfanityTracker();
    expect(t.register('g', 'a', 0)).toBe('warn');
    expect(t.register('g', 'b', 0)).toBe('warn');
  });
});
