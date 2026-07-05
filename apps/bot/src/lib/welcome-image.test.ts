import { describe, it, expect } from 'vitest';
import { formatWelcome } from './welcome-image.js';

describe('formatWelcome', () => {
  it('substitutes user mention, server and count', () => {
    expect(formatWelcome('أهلاً {user} في {server}! ({count})', { user: '<@1>', server: 'ARAB', count: 42 }))
      .toBe('أهلاً <@1> في ARAB! (42)');
  });
});
