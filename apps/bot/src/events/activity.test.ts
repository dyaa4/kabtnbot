import { describe, it, expect } from 'vitest';
import { elapsedSeconds } from './activity.js';

describe('elapsedSeconds', () => {
  it('computes whole seconds between two epoch millis', () => {
    expect(elapsedSeconds(1_000_000, 1_090_000)).toBe(90);
  });
  it('never returns negative', () => {
    expect(elapsedSeconds(2_000, 1_000)).toBe(0);
  });
});
