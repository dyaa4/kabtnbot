import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { synthesizeSpeech } from './tts.js';

const mockConfig = vi.hoisted(() => ({
  OPENAI_API_KEY: 'ok',
  OPENAI_TTS_MODEL: 'gpt-4o-mini-tts',
  OPENAI_REALTIME_VOICE: 'marin',
}));

vi.mock('../../config.js', () => ({ config: mockConfig }));

// 24kHz mono pcm response: 2 samples → upsampled to 8 (2x rate, stereo).
const PCM_BODY = Buffer.from([100, 0, 44, 1]); // samples 100, 300

describe('synthesizeSpeech (OpenAI TTS)', () => {
  beforeEach(() => {
    mockConfig.OPENAI_API_KEY = 'ok';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(PCM_BODY), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('throws TTS_NOT_CONFIGURED without an API key', async () => {
    mockConfig.OPENAI_API_KEY = '';
    await expect(synthesizeSpeech('hi', { language: 'en' })).rejects.toThrow('TTS_NOT_CONFIGURED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requests raw pcm with the configured model/voice and upsamples to 48k stereo', async () => {
    const out = await synthesizeSpeech('مرحبا', { language: 'ar' });
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'marin', response_format: 'pcm' });
    // 2 input samples * 2x rate * 2 channels * 2 bytes
    expect(out.length).toBe(PCM_BODY.length * 4);
  });

  it('passes a valid per-guild voice through', async () => {
    await synthesizeSpeech('hi', { language: 'en', voice: 'cedar' });
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.voice).toBe('cedar');
  });

  it('coerces a stale pre-migration voice id to the env default', async () => {
    await synthesizeSpeech('hi', { language: 'ar', voice: 'fahad' });
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.voice).toBe('marin');
  });

  it('propagates API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(synthesizeSpeech('hi', { language: 'en' })).rejects.toThrow(/OpenAI TTS 500/);
  });
});
