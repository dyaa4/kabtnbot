import { describe, it, expect } from 'vitest';
import { elapsedSeconds, splitSecondsByDay } from './activity.js';

describe('elapsedSeconds', () => {
  it('computes whole seconds between two epoch millis', () => {
    expect(elapsedSeconds(1_000_000, 1_090_000)).toBe(90);
  });
  it('never returns negative', () => {
    expect(elapsedSeconds(2_000, 1_000)).toBe(0);
  });
});

describe('splitSecondsByDay', () => {
  const ms = (iso: string) => Date.parse(iso);

  it('keeps a same-day span on one day', () => {
    expect(splitSecondsByDay(ms('2026-07-20T10:00:00Z'), ms('2026-07-20T10:01:30Z'))).toEqual([
      { date: '2026-07-20', seconds: 90 },
    ]);
  });

  it('splits a midnight-spanning span across both UTC days', () => {
    // 23:00 → 01:00 = 1h on the 20th + 1h on the 21st.
    const out = splitSecondsByDay(ms('2026-07-20T23:00:00Z'), ms('2026-07-21T01:00:00Z'));
    expect(out).toEqual([
      { date: '2026-07-20', seconds: 3600 },
      { date: '2026-07-21', seconds: 3600 },
    ]);
  });

  it('covers a span crossing several days', () => {
    const out = splitSecondsByDay(ms('2026-07-20T12:00:00Z'), ms('2026-07-22T12:00:00Z'));
    expect(out.map((s) => s.date)).toEqual(['2026-07-20', '2026-07-21', '2026-07-22']);
    expect(out.reduce((n, s) => n + s.seconds, 0)).toBe(2 * 86_400);
  });

  it('returns nothing for an empty or inverted span', () => {
    expect(splitSecondsByDay(ms('2026-07-20T10:00:00Z'), ms('2026-07-20T10:00:00Z'))).toEqual([]);
    expect(splitSecondsByDay(ms('2026-07-20T11:00:00Z'), ms('2026-07-20T10:00:00Z'))).toEqual([]);
  });
});
