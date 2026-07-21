export interface FocusLock {
  userId: string;
  until: number;
}

// When focus mode is on but the guild has no follow-up window, the lock still
// needs a lifetime — long enough to span the gap between a speaker's wake-word
// turns, short enough that a departed speaker frees the room quickly.
export const MIN_FOCUS_SECONDS = 15;

/** How long a focus lock should hold: the follow-up window if longer, else the floor. */
export function focusWindowMs(followUpSeconds: number): number {
  return Math.max(followUpSeconds, MIN_FOCUS_SECONDS) * 1000;
}

/**
 * Whether this speaker must be ignored because the bot is focused on someone
 * else. A lock that has expired (or belongs to this same speaker) never blocks.
 * Pure — the single decision point, exported for tests.
 */
export function isBlockedByFocus(focus: FocusLock | undefined, userId: string, now: number): boolean {
  return focus !== undefined && now < focus.until && focus.userId !== userId;
}

/**
 * Whether the focused speaker's own lock is still live and should be refreshed
 * (they're the active speaker and just talked again). False once it has expired
 * or if it belongs to a different user.
 */
export function shouldRefreshFocus(focus: FocusLock | undefined, userId: string, now: number): boolean {
  return focus !== undefined && now < focus.until && focus.userId === userId;
}
