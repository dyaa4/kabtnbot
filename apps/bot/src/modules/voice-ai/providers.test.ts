import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  GROQ_API_KEY: 'g', GROQ_MODEL: 'llama-3.3-70b-versatile',
}));
vi.mock('../../config.js', () => ({ config: mockConfig }));

const groqCall = vi.hoisted(() => vi.fn(async () => ({ choices: [{ message: { content: 'groq-answer' } }] })));
vi.mock('groq-sdk', () => ({
  default: class { chat = { completions: { create: groqCall } }; },
}));

import { getAIProvider, resetAIProvider } from './providers.js';

const opts = { systemPrompt: 'sys', username: 'u' };

beforeEach(() => {
  resetAIProvider();
  mockConfig.GROQ_API_KEY = 'g';
  groqCall.mockClear().mockResolvedValue({ choices: [{ message: { content: 'groq-answer' } }] });
});

describe('getAIProvider', () => {
  it('answers through Groq', async () => {
    const p = getAIProvider();
    expect(p.name).toBe('groq');
    expect(await p.generateResponse('q', opts)).toBe('groq-answer');
    expect(groqCall).toHaveBeenCalledWith(expect.objectContaining({ model: 'llama-3.3-70b-versatile' }));
  });

  it('sends system prompt, history and question in order', async () => {
    await getAIProvider().generateResponse('q', {
      ...opts,
      history: [{ role: 'user', content: 'q0' }, { role: 'assistant', content: 'a0' }],
    });
    expect(groqCall.mock.calls[0][0].messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q0' },
      { role: 'assistant', content: 'a0' },
      { role: 'user', content: 'q' },
    ]);
  });

  it('returns empty rather than undefined when the model sends no content', async () => {
    groqCall.mockResolvedValue({ choices: [{ message: { content: null } }] });
    expect(await getAIProvider().generateResponse('q', opts)).toBe('');
  });

  // There is no second provider: a Groq failure propagates, and every caller
  // is expected to handle it (generateAnswer returns '', the router stays quiet).
  it('propagates a Groq failure — no fallback exists', async () => {
    groqCall.mockRejectedValue(new Error('groq down'));
    await expect(getAIProvider().generateResponse('q', opts)).rejects.toThrow('groq down');
  });

  it('throws without a key', () => {
    mockConfig.GROQ_API_KEY = '';
    expect(() => getAIProvider()).toThrow('NO_AI_PROVIDER');
  });
});
