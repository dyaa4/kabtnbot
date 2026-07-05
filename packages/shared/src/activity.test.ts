import { describe, it, expect } from 'vitest';
import { activityScore } from './activity.js';

describe('activityScore', () => {
  it('weights voice minutes double, rounds seconds to minutes', () => {
    expect(activityScore({ messages: 10, voice_seconds: 300, reactions: 4 })).toBe(10 + 5 * 2 + 4); // 24
    expect(activityScore({ messages: 0, voice_seconds: 89, reactions: 0 })).toBe(2); // round(89/60)=1 → *2
  });
  it('is zero for no activity', () => {
    expect(activityScore({ messages: 0, voice_seconds: 0, reactions: 0 })).toBe(0);
  });
});
