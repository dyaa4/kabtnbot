import { describe, it, expect } from 'vitest';
import { pcmToWav } from './wav.js';

describe('pcmToWav', () => {
  it('writes a valid 44-byte RIFF header', () => {
    const pcm = Buffer.alloc(320);
    const wav = pcmToWav(pcm, 48000, 1);
    expect(wav.length).toBe(44 + 320);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(40)).toBe(320);
  });
});
