import { describe, it, expect } from 'vitest';
import { chunkText, wavPcm } from './tts.js';
import { pcmToWav } from './wav.js';

describe('chunkText (Orpheus 200-char cap)', () => {
  it('keeps short text as a single chunk', () => {
    expect(chunkText('مرحبا يا شباب', 200)).toEqual(['مرحبا يا شباب']);
  });

  it('splits at word boundaries without exceeding the limit', () => {
    const text = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(40);
    // No content lost and word order preserved.
    expect(chunks.join(' ')).toBe(text);
  });

  it('hard-splits a single word longer than the limit', () => {
    const long = 'x'.repeat(45);
    const chunks = chunkText(long, 20);
    expect(chunks).toEqual(['x'.repeat(20), 'x'.repeat(20), 'x'.repeat(5)]);
  });

  it('returns no chunks for empty/whitespace text', () => {
    expect(chunkText('   ', 200)).toEqual([]);
  });
});

describe('wavPcm', () => {
  it('round-trips PCM/format written by pcmToWav', () => {
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]); // 4 mono 16-bit samples
    const parsed = wavPcm(pcmToWav(pcm, 24000, 1));
    expect(parsed.sampleRate).toBe(24000);
    expect(parsed.channels).toBe(1);
    expect(Buffer.compare(parsed.pcm, pcm)).toBe(0);
  });
});
