import { describe, it, expect, beforeEach } from 'vitest';
import { trackCrossPost, clearSpamTracker, SPAM_WINDOW_MS } from './anti-spam.js';

const NOW = 1_700_000_000_000;

describe('trackCrossPost', () => {
  beforeEach(() => clearSpamTracker());

  it('triggers once the same content hits 3 distinct channels within the window', () => {
    expect(trackCrossPost('k', 'c1', 'm1', NOW)).toBeNull();
    expect(trackCrossPost('k', 'c2', 'm2', NOW + 1000)).toBeNull();
    const burst = trackCrossPost('k', 'c3', 'm3', NOW + 2000);
    expect(burst?.map((c) => c.messageId)).toEqual(['m1', 'm2', 'm3']);
  });

  it('never triggers on repeats within ONE channel (that is not cross-post spam)', () => {
    expect(trackCrossPost('k', 'c1', 'm1', NOW)).toBeNull();
    expect(trackCrossPost('k', 'c1', 'm2', NOW + 100)).toBeNull();
    expect(trackCrossPost('k', 'c1', 'm3', NOW + 200)).toBeNull();
  });

  it('copies outside the window do not count', () => {
    expect(trackCrossPost('k', 'c1', 'm1', NOW)).toBeNull();
    expect(trackCrossPost('k', 'c2', 'm2', NOW + SPAM_WINDOW_MS + 1)).toBeNull();
    // m1 expired — only c2+c3 in the window, below the threshold of 3
    expect(trackCrossPost('k', 'c3', 'm3', NOW + SPAM_WINDOW_MS + 2)).toBeNull();
  });

  it('forgets the key after triggering so the next copy starts fresh', () => {
    trackCrossPost('k', 'c1', 'm1', NOW);
    trackCrossPost('k', 'c2', 'm2', NOW);
    expect(trackCrossPost('k', 'c3', 'm3', NOW)).not.toBeNull();
    expect(trackCrossPost('k', 'c4', 'm4', NOW + 1)).toBeNull();
  });

  it('different content keys are tracked independently', () => {
    trackCrossPost('a', 'c1', 'm1', NOW);
    trackCrossPost('a', 'c2', 'm2', NOW);
    expect(trackCrossPost('b', 'c3', 'm3', NOW)).toBeNull();
  });
});
