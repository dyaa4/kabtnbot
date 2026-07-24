import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  OPENAI_API_KEY: 'k', OPENAI_TRANSCRIBE_MODEL: 'gpt-4o-mini-transcribe',
  GROQ_API_KEY: 'g', GROQ_STT_MODEL: 'whisper-large-v3-turbo',
}));
const flags = vi.hoisted(() => ({ groq: false }));
vi.mock('../../config.js', () => ({
  config: mockConfig,
  get voiceEngineGroq() { return flags.groq; },
}));
// Keep the test off the heavy realtime.ts import graph; sttHint is pure.
vi.mock('./realtime.js', () => ({ sttHint: (wake: string) => `HINT:${wake}` }));

import { transcribeUtterance } from './transcribe.js';

const pcm = Buffer.alloc(2400); // 50ms @ 24k mono
const opts = { language: 'ar', wakeWord: 'يا كابتن', flows: null };

beforeEach(() => {
  flags.groq = false;
  mockConfig.OPENAI_API_KEY = 'k';
  mockConfig.OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
  mockConfig.GROQ_API_KEY = 'g';
  mockConfig.GROQ_STT_MODEL = 'whisper-large-v3-turbo';
});

describe('transcribeUtterance (openai engine)', () => {
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
      return { ok: true, json: async () => ({ text: '  مرحبا  ' }) } as Response;
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
      return { ok: true, json: async () => ({ text: 'x' }) } as Response;
    }) as never;
    await transcribeUtterance(pcm, opts);
    expect(body?.get('prompt')).toBeNull();
  });

  it('returns empty on a non-OK response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response) as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('');
  });

  it('returns empty when fetch throws (never propagates)', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); }) as never;
    expect(await transcribeUtterance(pcm, opts)).toBe('');
  });
});

describe('transcribeUtterance (groq engine)', () => {
  beforeEach(() => { flags.groq = true; });

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
      return { ok: true, json: async () => ({ text: 'أهلا' }) } as Response;
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
