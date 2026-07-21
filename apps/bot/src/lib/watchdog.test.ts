import { describe, expect, it } from 'vitest';
import { newWatchdogState, watchdogTick } from './watchdog.js';

const MAX = 180_000; // 3 min

describe('watchdogTick', () => {
  it('never restarts while ready', () => {
    const s = newWatchdogState();
    expect(watchdogTick(s, true, 0, MAX)).toBe(false);
    expect(watchdogTick(s, true, 10_000_000, MAX)).toBe(false);
    expect(s.downSince).toBeNull();
  });

  it('starts the timer on the first not-ready observation but does not restart yet', () => {
    const s = newWatchdogState();
    expect(watchdogTick(s, false, 1_000, MAX)).toBe(false);
    expect(s.downSince).toBe(1_000);
  });

  it('does not restart before the threshold elapses', () => {
    const s = newWatchdogState();
    watchdogTick(s, false, 1_000, MAX);
    expect(watchdogTick(s, false, 1_000 + MAX - 1, MAX)).toBe(false);
  });

  it('restarts once the down-streak reaches the threshold', () => {
    const s = newWatchdogState();
    watchdogTick(s, false, 1_000, MAX);
    expect(watchdogTick(s, false, 1_000 + MAX, MAX)).toBe(true);
  });

  it('resets the streak when the client recovers, so a brief blip never restarts', () => {
    const s = newWatchdogState();
    watchdogTick(s, false, 1_000, MAX);
    watchdogTick(s, true, 2_000, MAX); // recovered
    expect(s.downSince).toBeNull();
    // A new down-streak must accumulate from scratch.
    watchdogTick(s, false, 3_000, MAX);
    expect(watchdogTick(s, false, 3_000 + MAX - 1, MAX)).toBe(false);
  });
});
