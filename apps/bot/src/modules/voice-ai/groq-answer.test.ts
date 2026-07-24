import { describe, it, expect, vi, beforeEach } from 'vitest';

const provider = vi.hoisted(() => ({ generateResponse: vi.fn(async () => 'أهلا وسهلا  ') }));
vi.mock('./providers.js', () => ({ getAIProvider: () => provider }));

import { generateAnswer, pushHistory, MAX_HISTORY_TURNS, type ChatTurn } from './groq-answer.js';

const guild = {
  id: 'g1', name: 'Legends',
  members: { cache: new Map([['u1', { displayName: 'Ali' }]]) },
} as never;

const config = {
  language: 'ar',
  voice: { personality_enabled: false, dialect: 'egyptian' },
} as never;

beforeEach(() => {
  provider.generateResponse.mockClear();
  provider.generateResponse.mockResolvedValue('أهلا وسهلا  ');
});

describe('generateAnswer', () => {
  it('builds a dialect system prompt, passes the speaker name + history, trims the reply', async () => {
    const history: ChatTurn[] = [{ role: 'user', content: 'q0' }, { role: 'assistant', content: 'a0' }];
    const out = await generateAnswer(guild, config, 'كيف حالك', 'u1', history);
    expect(out).toBe('أهلا وسهلا');
    const [query, opts] = provider.generateResponse.mock.calls[0];
    expect(query).toBe('كيف حالك');
    expect(opts.systemPrompt).toContain('اللهجة المصرية'); // dialect drives the wording
    expect(opts.username).toBe('Ali');
    expect(opts.history).toEqual(history);
  });

  it('returns empty (never throws) when the provider fails', async () => {
    provider.generateResponse.mockRejectedValueOnce(new Error('groq down'));
    expect(await generateAnswer(guild, config, 'س', 'u1')).toBe('');
  });

  it('caps the history passed to the provider', async () => {
    const long: ChatTurn[] = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    await generateAnswer(guild, config, 'q', 'u1', long);
    expect(provider.generateResponse.mock.calls[0][1].history).toHaveLength(MAX_HISTORY_TURNS);
  });
});

describe('pushHistory', () => {
  it('appends a user+assistant pair and trims to the cap', () => {
    const h: ChatTurn[] = [];
    for (let i = 0; i < 10; i++) pushHistory(h, `q${i}`, `a${i}`);
    expect(h).toHaveLength(MAX_HISTORY_TURNS);
    // Keeps the most recent turns.
    expect(h.at(-1)).toEqual({ role: 'assistant', content: 'a9' });
    expect(h.at(-2)).toEqual({ role: 'user', content: 'q9' });
  });
});
