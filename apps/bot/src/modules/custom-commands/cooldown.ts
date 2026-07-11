// Per guild:flow:user cooldown. Same lesson as voice-mod's 8s kick cooldown:
// STT can re-emit an utterance (echo of the bot's own TTS, split frames) and
// text spam would loop replies — silently skip repeats inside the window.
const lastRun = new Map<string, number>();
const PRUNE_ABOVE = 5_000;
const PRUNE_OLDER_MS = 60 * 60 * 1000;

/** True = allowed (and stamps the run); false = still cooling down, skip silently. */
export function checkCooldown(key: string, cooldownSeconds: number, nowMs: number = Date.now()): boolean {
  const last = lastRun.get(key);
  if (last !== undefined && nowMs - last < cooldownSeconds * 1000) return false;
  lastRun.set(key, nowMs);
  if (lastRun.size > PRUNE_ABOVE) {
    for (const [k, at] of lastRun) if (nowMs - at > PRUNE_OLDER_MS) lastRun.delete(k);
  }
  return true;
}

export function clearCooldowns(): void {
  lastRun.clear();
}
