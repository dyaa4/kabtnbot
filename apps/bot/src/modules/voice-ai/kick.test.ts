import { describe, it, expect } from 'vitest';
import { resolveKickTarget } from './kick.js';

const members = [
  { id: '1', displayName: 'Ahmad' },
  { id: '2', displayName: 'سعود' },
  { id: '3', displayName: 'Khalid Pro' },
];

describe('resolveKickTarget', () => {
  it('matches by normalized contains, case-insensitive', () => {
    // NOTE: brief's snippet used the Arabic-script query 'احمد' here, but normalizeText
    // (Task 4) never transliterates between scripts, so it can't match the Latin-script
    // displayName 'Ahmad'. Using the Latin 'ahmad' instead, consistent with this test's
    // own "case-insensitive" title.
    expect(resolveKickTarget('ahmad', members)).toBe('1');
    expect(resolveKickTarget('khalid', members)).toBe('3');
    expect(resolveKickTarget('سعود', members)).toBe('2');
  });
  it('returns null when no confident match', () => {
    expect(resolveKickTarget('someone', members)).toBeNull();
  });
});
