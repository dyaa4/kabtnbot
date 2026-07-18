import { describe, expect, it } from 'vitest';
import {
  downmixStereoToMono, downsample48to24, normalizeQuietAudio, pcmPeak, upsample24to48Stereo,
} from './audio-util.js';

function pcm(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => buf.writeInt16LE(s, i * 2));
  return buf;
}

function samples(buf: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i < buf.length; i += 2) out.push(buf.readInt16LE(i));
  return out;
}

describe('downmixStereoToMono', () => {
  it('averages left and right channels', () => {
    // L=100 R=200, L=-1000 R=1000
    expect(samples(downmixStereoToMono(pcm([100, 200, -1000, 1000])))).toEqual([150, 0]);
  });
});

describe('pcmPeak', () => {
  it('returns the highest absolute sample', () => {
    expect(pcmPeak(pcm([100, -5000, 300]))).toBe(5000);
    expect(pcmPeak(pcm([0, 0]))).toBe(0);
  });
});

describe('normalizeQuietAudio', () => {
  it('boosts quiet audio to ~80% peak', () => {
    const buf = pcm([1000, -500, 250]);
    normalizeQuietAudio(buf);
    expect(samples(buf)).toEqual([26214, -13107, 6554]);
  });

  it('leaves loud audio untouched', () => {
    const buf = pcm([25000, -12000]);
    normalizeQuietAudio(buf);
    expect(samples(buf)).toEqual([25000, -12000]);
  });

  it('is a no-op on silence', () => {
    const buf = pcm([0, 0]);
    normalizeQuietAudio(buf);
    expect(samples(buf)).toEqual([0, 0]);
  });
});

describe('downsample48to24', () => {
  it('averages adjacent sample pairs', () => {
    expect(samples(downsample48to24(pcm([100, 200, -400, -600])))).toEqual([150, -500]);
  });

  it('halves the sample count', () => {
    expect(downsample48to24(Buffer.alloc(480 * 2)).length).toBe(240 * 2);
  });
});

describe('upsample24to48Stereo', () => {
  it('interpolates and duplicates into stereo', () => {
    // in: [100, 300] → 48k mono [100, 200, 300, 300] → interleaved stereo
    expect(samples(upsample24to48Stereo(pcm([100, 300]))))
      .toEqual([100, 100, 200, 200, 300, 300, 300, 300]);
  });

  it('produces 4x the byte length', () => {
    expect(upsample24to48Stereo(Buffer.alloc(240 * 2)).length).toBe(240 * 2 * 4);
  });

  it('handles empty input', () => {
    expect(upsample24to48Stereo(Buffer.alloc(0)).length).toBe(0);
  });
});
