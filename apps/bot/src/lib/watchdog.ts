export interface WatchdogState {
  downSince: number | null;
}

export function newWatchdogState(): WatchdogState {
  return { downSince: null };
}

/**
 * Pure decision: has the bot been NOT ready for at least `maxDownMs`? A ready
 * check resets the timer; the first not-ready observation starts it. Returns
 * true only once the down-streak crosses the threshold. Exported for tests.
 */
export function watchdogTick(state: WatchdogState, ready: boolean, now: number, maxDownMs: number): boolean {
  if (ready) {
    state.downSince = null;
    return false;
  }
  if (state.downSince === null) {
    state.downSince = now;
    return false;
  }
  return now - state.downSince >= maxDownMs;
}

/**
 * If the Discord connection stays down longer than `maxDownMs`, exit so the
 * platform (Railway) starts a FRESH process — a wedged reconnect can otherwise
 * sit "online but dead" with no gateway and no heartbeat.
 */
export function registerConnectionWatchdog(
  isReady: () => boolean,
  opts: { maxDownMs?: number; checkMs?: number; onUnhealthy?: () => void; now?: () => number } = {},
): NodeJS.Timeout {
  const maxDownMs = opts.maxDownMs ?? 3 * 60_000;
  const checkMs = opts.checkMs ?? 30_000;
  const now = opts.now ?? Date.now;
  const onUnhealthy = opts.onUnhealthy ?? (() => process.exit(1));
  const state = newWatchdogState();
  return setInterval(() => {
    if (watchdogTick(state, isReady(), now(), maxDownMs)) {
      console.error(`[Watchdog] Discord not ready for ${Math.round(maxDownMs / 1000)}s — exiting for a clean restart`);
      onUnhealthy();
    }
  }, checkMs);
}
