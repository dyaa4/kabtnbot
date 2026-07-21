import { describe, expect, it } from 'vitest';
import { focusWindowMs, isBlockedByFocus, shouldRefreshFocus } from './focus.js';

describe('focusWindowMs', () => {
  it('is the follow-up window in ms (no artificial floor)', () => {
    expect(focusWindowMs(60)).toBe(60_000);
    expect(focusWindowMs(0)).toBe(0);
  });
});

describe('isBlockedByFocus', () => {
  it('does not block when there is no lock', () => {
    expect(isBlockedByFocus(undefined, 'b', 1_000, false)).toBe(false);
  });
  it('never blocks the focused speaker themselves', () => {
    expect(isBlockedByFocus({ userId: 'a', until: 5_000 }, 'a', 1_000, true)).toBe(false);
  });
  it('blocks a different speaker while the bot is replying — even past the window', () => {
    expect(isBlockedByFocus({ userId: 'a', until: 0 }, 'b', 9_999, true)).toBe(true);
  });
  it('blocks a different speaker while the follow-up window is open', () => {
    expect(isBlockedByFocus({ userId: 'a', until: 5_000 }, 'b', 1_000, false)).toBe(true);
  });
  it('frees the floor once the reply is done and the window has lapsed → next speaker takes over', () => {
    expect(isBlockedByFocus({ userId: 'a', until: 5_000 }, 'b', 5_000, false)).toBe(false);
    expect(isBlockedByFocus({ userId: 'a', until: 0 }, 'b', 1, false)).toBe(false);
  });
});

describe('shouldRefreshFocus', () => {
  it('refreshes for the focused speaker while their window is live', () => {
    expect(shouldRefreshFocus({ userId: 'a', until: 5_000 }, 'a', 1_000)).toBe(true);
  });
  it('does not refresh for another speaker or after the window lapses', () => {
    expect(shouldRefreshFocus({ userId: 'a', until: 5_000 }, 'b', 1_000)).toBe(false);
    expect(shouldRefreshFocus({ userId: 'a', until: 5_000 }, 'a', 5_000)).toBe(false);
    expect(shouldRefreshFocus(undefined, 'a', 1_000)).toBe(false);
  });
});
