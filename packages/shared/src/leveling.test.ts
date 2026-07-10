import { describe, it, expect } from 'vitest';
import { xpToNext, totalXpForLevel, levelFromXp, levelProgress } from './leveling.js';

describe('leveling curve', () => {
  it('xpToNext grows with level', () => {
    expect(xpToNext(0)).toBe(100);
    expect(xpToNext(1)).toBe(155);
    expect(xpToNext(2)).toBe(220);
    expect(xpToNext(5)).toBeGreaterThan(xpToNext(4));
  });

  it('totalXpForLevel is the cumulative sum', () => {
    expect(totalXpForLevel(0)).toBe(0);
    expect(totalXpForLevel(1)).toBe(100);
    expect(totalXpForLevel(2)).toBe(100 + 155);
    expect(totalXpForLevel(3)).toBe(100 + 155 + 220);
  });

  it('levelFromXp is the inverse of totalXpForLevel', () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(99)).toBe(0);
    expect(levelFromXp(100)).toBe(1);
    expect(levelFromXp(254)).toBe(1);
    expect(levelFromXp(255)).toBe(2);
    for (let l = 0; l < 30; l++) {
      expect(levelFromXp(totalXpForLevel(l))).toBe(l);
      expect(levelFromXp(totalXpForLevel(l + 1) - 1)).toBe(l);
    }
  });

  it('levelProgress reports position within the current level', () => {
    const p = levelProgress(120);
    expect(p.level).toBe(1);
    expect(p.intoLevel).toBe(20); // 120 - 100
    expect(p.neededForNext).toBe(xpToNext(1)); // 155
  });
});
