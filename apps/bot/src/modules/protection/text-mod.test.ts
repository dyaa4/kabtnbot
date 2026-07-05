import { describe, it, expect } from 'vitest';
import { shouldModerate } from './text-mod.js';

const cfg = (over: Partial<{ enabled: boolean; text: boolean }>) => ({
  protection: {
    enabled: over.enabled ?? true,
    text_protection: over.text ?? true,
    voice_moderation: true,
    custom_words: [],
    allowed_domains: [],
    log_channel_id: null,
  },
}) as never;

describe('shouldModerate', () => {
  it('only moderates non-admins when both toggles on', () => {
    expect(shouldModerate(cfg({}), false)).toBe(true);
    expect(shouldModerate(cfg({}), true)).toBe(false); // admins exempt
    expect(shouldModerate(cfg({ enabled: false }), false)).toBe(false);
    expect(shouldModerate(cfg({ text: false }), false)).toBe(false);
  });
});
