export interface FocusLock {
  userId: string;
  until: number;
}

/**
 * How long the focused speaker keeps the floor AFTER an utterance, in ms: the
 * follow-up window (0 = none). The "bot is replying" guard covers the reply
 * itself, so with no follow-up window the floor frees the moment the reply ends
 * — then whoever speaks next becomes the new focus.
 */
export function focusWindowMs(followUpSeconds: number): number {
  return followUpSeconds * 1000;
}

/**
 * Whether a DIFFERENT speaker must be ignored right now: the focused speaker
 * still holds the floor because the bot is mid-reply to them, or their
 * follow-up window is still open. Once neither holds, the floor is free and the
 * next speaker to address the bot takes focus. Pure — the single decision
 * point, exported for tests.
 */
export function isBlockedByFocus(
  focus: FocusLock | undefined,
  userId: string,
  now: number,
  botResponding: boolean,
): boolean {
  if (focus === undefined || focus.userId === userId) return false;
  return botResponding || now < focus.until;
}

/**
 * Whether the focused speaker's own follow-up window is still live and should
 * be pushed forward (they just talked again, so they keep the floor). False for
 * a different user or once the window has lapsed.
 */
export function shouldRefreshFocus(focus: FocusLock | undefined, userId: string, now: number): boolean {
  return focus !== undefined && focus.userId === userId && now < focus.until;
}
