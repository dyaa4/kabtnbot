import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  ELEVENLABS_API_KEY: 'k',
  ELEVENLABS_MODEL: 'eleven_turbo_v2_5',
  ELEVENLABS_VOICE_MSA: 'voice-msa',
  ELEVENLABS_VOICE_GULF: 'voice-gulf',
  ELEVENLABS_VOICE_EGYPTIAN: '',
  ELEVENLABS_VOICE_LEVANTINE: '',
  ELEVENLABS_VOICE_SAUDI: '',
}));

vi.mock('../../config.js', () => ({
  config: mockConfig,
  dialectVoiceId: (d: string) => {
    switch (d) {
      case 'gulf': return mockConfig.ELEVENLABS_VOICE_GULF;
      case 'egyptian': return mockConfig.ELEVENLABS_VOICE_EGYPTIAN;
      case 'levantine': return mockConfig.ELEVENLABS_VOICE_LEVANTINE;
      case 'saudi': return mockConfig.ELEVENLABS_VOICE_SAUDI;
      case 'msa': return mockConfig.ELEVENLABS_VOICE_MSA;
      default: return '';
    }
  },
}));

import { synthesizeDialectSpeech, useDialectVoice } from './elevenlabs-tts.js';

// 24kHz mono pcm response: 2 samples → upsampled to 8 (2x rate, stereo).
const PCM_BODY = Buffer.from([100, 0, 44, 1]);

describe('synthesizeDialectSpeech (ElevenLabs)', () => {
  beforeEach(() => {
    mockConfig.ELEVENLABS_API_KEY = 'k';
    mockConfig.ELEVENLABS_VOICE_MSA = 'voice-msa';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(PCM_BODY), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('throws ELEVENLABS_NOT_CONFIGURED without an API key', async () => {
    mockConfig.ELEVENLABS_API_KEY = '';
    await expect(synthesizeDialectSpeech('مرحبا', 'gulf')).rejects.toThrow('ELEVENLABS_NOT_CONFIGURED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws ELEVENLABS_VOICE_NOT_CONFIGURED when the dialect has no voice id', async () => {
    await expect(synthesizeDialectSpeech('مرحبا', 'egyptian')).rejects.toThrow('ELEVENLABS_VOICE_NOT_CONFIGURED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs pcm_24000 to the dialect voice id with the model, and upsamples to 48k stereo', async () => {
    const out = await synthesizeDialectSpeech('مرحبا', 'gulf');
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/text-to-speech/voice-gulf');
    expect(url).toContain('output_format=pcm_24000');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('k');
    expect(JSON.parse(init.body as string)).toMatchObject({ text: 'مرحبا', model_id: 'eleven_turbo_v2_5' });
    // 2 input samples * 2x rate * 2 channels * 2 bytes
    expect(out.length).toBe(PCM_BODY.length * 4);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    await expect(synthesizeDialectSpeech('مرحبا', 'gulf')).rejects.toThrow(/ElevenLabs TTS 401/);
  });
});

describe('useDialectVoice', () => {
  beforeEach(() => {
    mockConfig.ELEVENLABS_API_KEY = 'k';
    mockConfig.ELEVENLABS_VOICE_MSA = 'voice-msa';
  });

  it('true only for Arabic with a key and a configured dialect voice', () => {
    expect(useDialectVoice('ar', 'gulf')).toBe(true);
    expect(useDialectVoice('ar', 'msa')).toBe(true);
  });

  it('false for non-Arabic languages', () => {
    expect(useDialectVoice('en', 'gulf')).toBe(false);
  });

  it('false when the dialect has no voice id', () => {
    expect(useDialectVoice('ar', 'egyptian')).toBe(false);
  });

  it('false without an API key', () => {
    mockConfig.ELEVENLABS_API_KEY = '';
    expect(useDialectVoice('ar', 'gulf')).toBe(false);
  });
});
