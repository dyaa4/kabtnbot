import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  OPENAI_API_KEY: 'k', OPENAI_TRANSCRIBE_MODEL: 'gpt-4o-mini-transcribe',
  GROQ_API_KEY: 'g', GROQ_STT_MODEL: 'whisper-large-v3-turbo',
  ELEVENLABS_API_KEY: 'e', ELEVENLABS_STT_MODEL: 'scribe_v2',
}));
const flags = vi.hoisted(() => ({ stt: 'openai' as string }));
vi.mock('../../config.js', () => ({
  config: mockConfig,
  get sttProvider() { return flags.stt; },
}));
const terms = vi.hoisted(() => ({ extra: [] as string[] }));
// Keep the test off the heavy realtime.ts import graph; both helpers are pure.
vi.mock('./realtime.js', () => ({
  sttHint: (wake: string) => `HINT:${wake}`,
  sttTerms: (wake: string) => [wake, 'شغل اغنية', ...terms.extra],
}));

import { transcribeUtterance } from './transcribe.js';

const pcm = Buffer.alloc(9600); // 200ms @ 24k mono
const opts = { language: 'ar', wakeWord: 'يا كابتن', flows: null };

beforeEach(() => {
  flags.stt = 'openai';
  terms.extra = [];
  mockConfig.OPENAI_API_KEY = 'k';
  mockConfig.OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
  mockConfig.GROQ_API_KEY = 'g';
  mockConfig.GROQ_STT_MODEL = 'whisper-large-v3-turbo';
  mockConfig.ELEVENLABS_API_KEY = 'e';
  mockConfig.ELEVENLABS_STT_MODEL = 'scribe_v2';
});

describe('transcribeUtterance (openai provider)', () => {
  it('returns empty without an API key (never calls the API)', async () => {
    mockConfig.OPENAI_API_KEY = '';
    const spy = vi.fn();
    global.fetch = spy as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('POSTs a WAV file to OpenAI with model + language + decode prompt (gpt-4o), trims the text', async () => {
    let url: string | undefined;
    let body: FormData | undefined;
    global.fetch = vi.fn(async (u: string, init: RequestInit) => {
      url = u; body = init.body as FormData;
      return { ok: true, status: 200, json: async () => ({ text: '  مرحبا  ' }) } as Response;
    }) as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('مرحبا');
    expect(url).toContain('api.openai.com');
    expect(body?.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(body?.get('language')).toBe('ar');
    expect(body?.get('prompt')).toBe('HINT:يا كابتن');
    expect(body?.get('file')).toBeInstanceOf(Blob);
  });

  it('omits the decode prompt for whisper models', async () => {
    mockConfig.OPENAI_TRANSCRIBE_MODEL = 'whisper-1';
    let body: FormData | undefined;
    global.fetch = vi.fn(async (_url: string, init: RequestInit) => {
      body = init.body as FormData;
      return { ok: true, status: 200, json: async () => ({ text: 'x' }) } as Response;
    }) as never;
    await transcribeUtterance(pcm, opts);
    expect(body?.get('prompt')).toBeNull();
  });

  it('returns empty on a non-OK response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 429, text: async () => '' }) as Response) as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('');
  });

  it('returns empty when fetch throws (never propagates)', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); }) as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('');
  });

  it('skips audio shorter than 100ms (every provider rejects it)', async () => {
    const spy = vi.fn();
    global.fetch = spy as never;
    expect(await transcribeUtterance(Buffer.alloc(2400), opts)).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('transcribeUtterance (groq provider)', () => {
  beforeEach(() => { flags.stt = 'groq'; });

  it('returns empty without a GROQ key (never calls the API)', async () => {
    mockConfig.GROQ_API_KEY = '';
    const spy = vi.fn();
    global.fetch = spy as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('POSTs to Groq with the Groq STT model, GROQ auth, and the decode prompt', async () => {
    let url: string | undefined;
    let init: RequestInit | undefined;
    global.fetch = vi.fn(async (u: string, i: RequestInit) => {
      url = u; init = i;
      return { ok: true, status: 200, json: async () => ({ text: 'أهلا' }) } as Response;
    }) as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('أهلا');
    expect(url).toContain('api.groq.com');
    const body = init!.body as FormData;
    expect(body.get('model')).toBe('whisper-large-v3-turbo');
    expect(body.get('language')).toBe('ar');
    expect(body.get('prompt')).toBe('HINT:يا كابتن'); // Groq Whisper accepts a prompt
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer g');
  });
});

describe('transcribeUtterance (elevenlabs provider)', () => {
  beforeEach(() => { flags.stt = 'elevenlabs'; });

  it('POSTs to Scribe with xi-api-key, model_id, language_code and keyterm biasing', async () => {
    let url: string | undefined;
    let init: RequestInit | undefined;
    global.fetch = vi.fn(async (u: string, i: RequestInit) => {
      url = u; init = i;
      return { ok: true, status: 200, json: async () => ({ text: ' أهلا ' }) } as Response;
    }) as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('أهلا');
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    const headers = init!.headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe('e');
    expect(headers.Authorization).toBeUndefined();
    const body = init!.body as FormData;
    expect(body.get('model_id')).toBe('scribe_v2');
    expect(body.get('language_code')).toBe('ar');
    expect(body.get('tag_audio_events')).toBe('false');
    // One field per term — a JSON array would land as a single keyterm whose
    // brackets trip Scribe's invalid-character check and 400 the request.
    expect(body.getAll('keyterms')).toEqual(['يا كابتن', 'شغل اغنية']);
    expect(body.get('file')).toBeInstanceOf(Blob);
  });

  it('strips characters Scribe rejects and drops terms left empty', async () => {
    terms.extra = ['شغل 🎵 اغنية!', '???', 'a'.repeat(60), 'one two three four five six'];
    let body: FormData | undefined;
    global.fetch = vi.fn(async (_u: string, i: RequestInit) => {
      body = i.body as FormData;
      return { ok: true, status: 200, json: async () => ({ text: 'x' }) } as Response;
    }) as never;
    await transcribeUtterance(pcm, opts);
    // Symbols → dropped, over-long and over-5-words terms → dropped entirely.
    expect(body?.getAll('keyterms')).toEqual(['يا كابتن', 'شغل اغنية', 'شغل اغنية']);
  });

  for (const status of [400, 422]) {
    it(`retries once without keyterms when Scribe rejects them (${status})`, async () => {
      const bodies: FormData[] = [];
      global.fetch = vi.fn(async (_u: string, i: RequestInit) => {
        bodies.push(i.body as FormData);
        return bodies.length === 1
          ? ({ ok: false, status, text: async () => 'invalid keyterms' } as Response)
          : ({ ok: true, status: 200, json: async () => ({ text: 'أهلا' }) } as Response);
      }) as never;
      expect(await transcribeUtterance(pcm, opts)).toBe('أهلا');
      expect(bodies).toHaveLength(2);
      expect(bodies[0].getAll('keyterms')).not.toHaveLength(0);
      expect(bodies[1].getAll('keyterms')).toHaveLength(0);
      expect(bodies[1].get('model_id')).toBe('scribe_v2');
    });
  }

  it('does not retry a rejection twice', async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 400, text: async () => 'nope' }) as Response);
    global.fetch = spy as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('falls back to Groq when the ElevenLabs key is missing (deaf is worse)', async () => {
    mockConfig.ELEVENLABS_API_KEY = '';
    let url: string | undefined;
    global.fetch = vi.fn(async (u: string) => {
      url = u;
      return { ok: true, status: 200, json: async () => ({ text: 'أهلا' }) } as Response;
    }) as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('أهلا');
    expect(url).toContain('api.groq.com');
  });

  it('returns empty when neither ElevenLabs nor Groq has a key', async () => {
    mockConfig.ELEVENLABS_API_KEY = '';
    mockConfig.GROQ_API_KEY = '';
    const spy = vi.fn();
    global.fetch = spy as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });
});
