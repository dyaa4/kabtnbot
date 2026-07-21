import { describe, expect, it } from 'vitest';
import { focusWindowMs, isBlockedByFocus, shouldRefreshFocus, MIN_FOCUS_SECONDS } from './focus.js';

describe('focusWindowMs', () => {
  it('uses the follow-up window when it is longer than the floor', () => {
    expect(focusWindowMs(60)).toBe(60_000);
  });
  it('falls back to the floor when follow-up is off or short', () => {
    expect(focusWindowMs(0)).toBe(MIN_FOCUS_SECONDS * 1000);
    expect(focusWindowMs(5)).toBe(MIN_FOCUS_SECONDS * 1000);
  });
});

describe('isBlockedByFocus', () => {
  it('does not block when there is no lock', () => {
    expect(isBlockedByFocus(undefined, 'b', 1_000)).toBe(false);
  });
  it('blocks a different speaker while the lock is live', () => {
    expect(isBlockedByFocus({ userId: 'a', until: 5_000 }, 'b', 1_000)).toBe(true);
  });
  it('never blocks the focused speaker themselves', () => {
    expect(isBlockedByFocus({ userId: 'a', until: 5_000 }, 'a', 1_000)).toBe(false);
  });
  it('stops blocking once the lock has expired', () => {
    expect(isBlockedByFocus({ userId: 'a', until: 5_000 }, 'b', 5_000)).toBe(false);
    expect(isBlockedByFocus({ userId: 'a', until: 5_000 }, 'b', 6_000)).toBe(false);
  });
});

describe('shouldRefreshFocus', () => {
  it('refreshes for the focused speaker while live', () => {
    expect(shouldRefreshFocus({ userId: 'a', until: 5_000 }, 'a', 1_000)).toBe(true);
  });
  it('does not refresh for another speaker or after expiry', () => {
    expect(shouldRefreshFocus({ userId: 'a', until: 5_000 }, 'b', 1_000)).toBe(false);
    expect(shouldRefreshFocus({ userId: 'a', until: 5_000 }, 'a', 5_000)).toBe(false);
    expect(shouldRefreshFocus(undefined, 'a', 1_000)).toBe(false);
  });
});
