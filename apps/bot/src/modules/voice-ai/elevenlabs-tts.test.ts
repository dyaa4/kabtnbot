import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  ELEVENLABS_API_KEY: 'k',
  ELEVENLABS_MODEL: 'eleven_turbo_v2_5',
  ELEVENLABS_VOICE_DEFAULT: 'voice-default',
  ELEVENLABS_VOICE_MSA: 'voice-msa',
  ELEVENLABS_VOICE_GULF: 'voice-gulf',
  ELEVENLABS_VOICE_EGYPTIAN: '',
  ELEVENLABS_VOICE_LEVANTINE: '',
}));

vi.mock('../../config.js', () => ({
  config: mockConfig,
  dialectVoiceId: (d: string) => {
    switch (d) {
      case 'gulf': return mockConfig.ELEVENLABS_VOICE_GULF;
      case 'egyptian': return mockConfig.ELEVENLABS_VOICE_EGYPTIAN;
      case 'levantine': return mockConfig.ELEVENLABS_VOICE_LEVANTINE;
      case 'msa': return mockConfig.ELEVENLABS_VOICE_MSA;
      default: return '';
    }
  },
}));

import {
  synthesizeDialectSpeech, useDialectVoice, resolveVoiceId, synthesizeVoice, elevenLabsReady,
  clearSpeechCache,
} from './elevenlabs-tts.js';

// 24kHz mono pcm response: 2 samples → upsampled to 8 (2x rate, stereo).
const PCM_BODY = Buffer.from([100, 0, 44, 1]);

// Synthesis is cached by voice+model+text, so identical lines across tests
// would otherwise reuse the previous test's audio and skip fetch entirely.
beforeEach(() => clearSpeechCache());

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

describe('speech cache', () => {
  beforeEach(() => {
    mockConfig.ELEVENLABS_API_KEY = 'k';
    mockConfig.ELEVENLABS_VOICE_GULF = 'voice-gulf';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(PCM_BODY), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('serves a repeated line from cache — the bot says warn/kick lines verbatim every time', async () => {
    const first = await synthesizeDialectSpeech('تم تحذيرك', 'gulf');
    const second = await synthesizeDialectSpeech('تم تحذيرك', 'gulf');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('keys on the voice id — the same text in another voice is synthesized again', async () => {
    await synthesizeDialectSpeech('تم تحذيرك', 'gulf');
    await synthesizeDialectSpeech('تم تحذيرك', 'msa');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keys on the model — a model switch must not replay the old voice', async () => {
    await synthesizeDialectSpeech('تم تحذيرك', 'gulf');
    mockConfig.ELEVENLABS_MODEL = 'eleven_flash_v2_5';
    await synthesizeDialectSpeech('تم تحذيرك', 'gulf');
    mockConfig.ELEVENLABS_MODEL = 'eleven_turbo_v2_5';
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed synthesis', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(synthesizeDialectSpeech('تم تحذيرك', 'gulf')).rejects.toThrow();
    await expect(synthesizeDialectSpeech('تم تحذيرك', 'gulf')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('resolveVoiceId', () => {
  beforeEach(() => { mockConfig.ELEVENLABS_VOICE_DEFAULT = 'voice-default'; mockConfig.ELEVENLABS_VOICE_MSA = 'voice-msa'; });

  it('Arabic → the dialect voice id', () => {
    expect(resolveVoiceId('ar', 'gulf')).toBe('voice-gulf');
  });
  it('Arabic with no dialect voice → the default', () => {
    expect(resolveVoiceId('ar', 'egyptian')).toBe('voice-default');
  });
  it('non-Arabic → the default', () => {
    expect(resolveVoiceId('de', 'msa')).toBe('voice-default');
  });
  it('empty when nothing resolves', () => {
    mockConfig.ELEVENLABS_VOICE_DEFAULT = '';
    expect(resolveVoiceId('de', 'msa')).toBe('');
  });
});

describe('synthesizeVoice', () => {
  beforeEach(() => {
    mockConfig.ELEVENLABS_API_KEY = 'k';
    mockConfig.ELEVENLABS_VOICE_DEFAULT = 'voice-default';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(PCM_BODY), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('speaks a non-Arabic guild with the default voice', async () => {
    await synthesizeVoice('hallo', 'de', 'msa');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/text-to-speech/voice-default');
  });

  it('throws ELEVENLABS_VOICE_NOT_CONFIGURED when no voice id resolves', async () => {
    mockConfig.ELEVENLABS_VOICE_DEFAULT = '';
    await expect(synthesizeVoice('hi', 'en', 'msa')).rejects.toThrow('ELEVENLABS_VOICE_NOT_CONFIGURED');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('elevenLabsReady', () => {
  beforeEach(() => { mockConfig.ELEVENLABS_API_KEY = 'k'; mockConfig.ELEVENLABS_VOICE_DEFAULT = 'voice-default'; });
  it('true with a key and a resolvable voice', () => {
    expect(elevenLabsReady('de', 'msa')).toBe(true);
    expect(elevenLabsReady('ar', 'gulf')).toBe(true);
  });
  it('false without a key', () => {
    mockConfig.ELEVENLABS_API_KEY = '';
    expect(elevenLabsReady('ar', 'gulf')).toBe(false);
  });
  it('false when no voice id resolves', () => {
    mockConfig.ELEVENLABS_VOICE_DEFAULT = '';
    expect(elevenLabsReady('en', 'msa')).toBe(false);
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
