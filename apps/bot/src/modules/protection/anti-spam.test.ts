import { describe, it, expect, beforeEach } from 'vitest';
import { trackCrossPost, clearSpamTracker, spamSignature, SPAM_WINDOW_MS } from './anti-spam.js';

const NOW = 1_700_000_000_000;

describe('trackCrossPost', () => {
  beforeEach(() => clearSpamTracker());

  it('triggers once the same content hits 3 distinct channels within the window', () => {
    expect(trackCrossPost('k', 'c1', 'm1', NOW)).toBeNull();
    expect(trackCrossPost('k', 'c2', 'm2', NOW + 1000)).toBeNull();
    const hit = trackCrossPost('k', 'c3', 'm3', NOW + 2000);
    expect(hit?.firstHit).toBe(true);
    expect(hit?.copies.map((c) => c.messageId)).toEqual(['m1', 'm2', 'm3']);
  });

  it('never triggers on repeats within ONE channel (that is not cross-post spam)', () => {
    expect(trackCrossPost('k', 'c1', 'm1', NOW)).toBeNull();
    expect(trackCrossPost('k', 'c1', 'm2', NOW + 100)).toBeNull();
    expect(trackCrossPost('k', 'c1', 'm3', NOW + 200)).toBeNull();
  });

  it('copies outside the window do not count', () => {
    expect(trackCrossPost('k', 'c1', 'm1', NOW)).toBeNull();
    expect(trackCrossPost('k', 'c2', 'm2', NOW + SPAM_WINDOW_MS + 1)).toBeNull();
    expect(trackCrossPost('k', 'c3', 'm3', NOW + SPAM_WINDOW_MS + 2)).toBeNull();
  });

  it('keeps mopping up every FURTHER copy after the burst (a blast into 10 channels is fully cleaned)', () => {
    trackCrossPost('k', 'c1', 'm1', NOW);
    trackCrossPost('k', 'c2', 'm2', NOW);
    expect(trackCrossPost('k', 'c3', 'm3', NOW)?.firstHit).toBe(true); // burst
    const next = trackCrossPost('k', 'c4', 'm4', NOW + 1);
    expect(next?.firstHit).toBe(false); // still deleted, but no second notice
    expect(next?.copies.map((c) => c.messageId)).toEqual(['m4']);
    expect(trackCrossPost('k', 'c5', 'm5', NOW + 2)?.copies.map((c) => c.messageId)).toEqual(['m5']);
  });

  it('different content keys are tracked independently', () => {
    trackCrossPost('a', 'c1', 'm1', NOW);
    trackCrossPost('a', 'c2', 'm2', NOW);
    expect(trackCrossPost('b', 'c3', 'm3', NOW)).toBeNull();
  });
});

describe('spamSignature', () => {
  const fake = (o: { content?: string; attachments?: unknown[]; stickers?: unknown[] }) =>
    ({
      content: o.content ?? '',
      attachments: new Map((o.attachments ?? []).map((a, i) => [String(i), a])),
      stickers: new Map((o.stickers ?? []).map((s, i) => [String(i), s])),
    }) as never;

  it('fingerprints an image message with NO caption (the reported gap)', () => {
    expect(spamSignature(fake({ attachments: [{ name: 'promo.png', size: 4242 }] }))).toBe('att:promo.png:4242');
  });

  it('combines text and attachments', () => {
    const sig = spamSignature(fake({ content: 'اشتري الان', attachments: [{ name: 'a.jpg', size: 10 }] }));
    expect(sig).toContain('att:a.jpg:10');
    expect(sig.startsWith('اشتري الان')).toBe(true);
  });

  it('is empty for a message with no text, image or sticker', () => {
    expect(spamSignature(fake({}))).toBe('');
  });

  it('includes stickers', () => {
    expect(spamSignature(fake({ stickers: [{ id: 'sticker-9' }] }))).toBe('stk:sticker-9');
  });
});
