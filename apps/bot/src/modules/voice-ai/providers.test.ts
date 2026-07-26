import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  GROQ_API_KEY: 'g', GROQ_MODEL: 'llama-3.3-70b-versatile',
  GEMINI_API_KEY: 'gem', GEMINI_MODEL: 'gemini-2.0-flash',
  AI_PROVIDER: '',
}));
vi.mock('../../config.js', () => ({ config: mockConfig }));

const groqCall = vi.hoisted(() => vi.fn(async () => ({ choices: [{ message: { content: 'groq-answer' } }] })));
vi.mock('groq-sdk', () => ({
  default: class { chat = { completions: { create: groqCall } }; },
}));

const geminiSend = vi.hoisted(() => vi.fn(async () => ({ response: { text: () => 'gemini-answer' } })));
const geminiModel = vi.hoisted(() => vi.fn());
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(opts: { model: string }) {
      geminiModel(opts.model);
      return { startChat: () => ({ sendMessage: geminiSend }) };
    }
  },
}));

import { getAIProvider, resetAIProvider } from './providers.js';

const opts = { systemPrompt: 'sys', username: 'u' };

beforeEach(() => {
  resetAIProvider();
  mockConfig.GROQ_API_KEY = 'g';
  mockConfig.GEMINI_API_KEY = 'gem';
  mockConfig.GEMINI_MODEL = 'gemini-2.0-flash';
  mockConfig.AI_PROVIDER = '';
  groqCall.mockClear().mockResolvedValue({ choices: [{ message: { content: 'groq-answer' } }] });
  geminiSend.mockClear();
  geminiModel.mockClear();
});

describe('getAIProvider', () => {
  it('defaults to Groq when AI_PROVIDER is unset', async () => {
    expect(await getAIProvider().generateResponse('q', opts)).toBe('groq-answer');
    expect(geminiSend).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER=gemini makes Gemini the primary', async () => {
    mockConfig.AI_PROVIDER = 'gemini';
    expect(await getAIProvider().generateResponse('q', opts)).toBe('gemini-answer');
    expect(groqCall).not.toHaveBeenCalled();
  });

  it('keeps the other provider as fallback when the primary fails', async () => {
    mockConfig.AI_PROVIDER = 'gemini';
    geminiSend.mockRejectedValueOnce(new Error('gemini down'));
    expect(await getAIProvider().generateResponse('q', opts)).toBe('groq-answer');
  });

  it('falls back to Gemini when Groq fails (historical default)', async () => {
    groqCall.mockRejectedValueOnce(new Error('groq down'));
    geminiSend.mockResolvedValueOnce({ response: { text: () => 'gemini-answer' } });
    expect(await getAIProvider().generateResponse('q', opts)).toBe('gemini-answer');
  });

  it('uses Gemini alone when only its key is set, whatever AI_PROVIDER says', async () => {
    mockConfig.GROQ_API_KEY = '';
    expect(await getAIProvider().generateResponse('q', opts)).toBe('gemini-answer');
  });

  it('honours GEMINI_MODEL', async () => {
    mockConfig.AI_PROVIDER = 'gemini';
    mockConfig.GEMINI_MODEL = 'gemini-2.5-flash';
    await getAIProvider().generateResponse('q', opts);
    expect(geminiModel).toHaveBeenCalledWith('gemini-2.5-flash');
  });

  it('throws when no provider has a key', () => {
    mockConfig.GROQ_API_KEY = '';
    mockConfig.GEMINI_API_KEY = '';
    expect(() => getAIProvider()).toThrow('NO_AI_PROVIDER');
  });
});
