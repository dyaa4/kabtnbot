import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chunkText, wavPcm, synthesizeSpeech } from './tts.js';
import { pcmToWav } from './wav.js';

const mockConfig = vi.hoisted(() => ({
  GROQ_API_KEY: 'gk',
  GROQ_TTS_MODEL: 'orpheus',
  GROQ_TTS_VOICE: 'fahad',
  GROQ_TTS_MODEL_EN: 'playai-tts',
  GROQ_TTS_VOICE_EN: 'Fritz-PlayAI',
  ELEVENLABS_API_KEY: '',
  ELEVENLABS_VOICE_ID: 'v1',
  ELEVENLABS_MODEL_ID: 'eleven_flash_v2_5',
}));

vi.mock('../../config.js', () => ({ config: mockConfig }));

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

describe('synthesizeSpeech language routing', () => {
  beforeEach(() => {
    mockConfig.ELEVENLABS_API_KEY = '';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('throws TTS_UNSUPPORTED_LANGUAGE for non-Groq languages without ElevenLabs', async () => {
    await expect(synthesizeSpeech('hallo', { language: 'de' })).rejects.toThrow('TTS_UNSUPPORTED_LANGUAGE');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('routes non-Groq languages to ElevenLabs when a key is configured', async () => {
    mockConfig.ELEVENLABS_API_KEY = 'el-key';
    // 500 response → the ElevenLabs error proves routing reached its endpoint.
    await expect(synthesizeSpeech('hallo', { language: 'de' })).rejects.toThrow(/ElevenLabs 500/);
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('api.elevenlabs.io');
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
