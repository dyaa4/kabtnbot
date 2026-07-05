export interface ActivityCounts {
  messages: number;
  voice_seconds: number;
  reactions: number;
}

/** Composite activity score: messages*1 + minutes*2 + reactions*1. */
export function activityScore(c: ActivityCounts): number {
  return c.messages + Math.round(c.voice_seconds / 60) * 2 + c.reactions;
}
