import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompts.js';

describe('buildSystemPrompt', () => {
  it('injects the guild name and an Arabic style rule', () => {
    const p = buildSystemPrompt('سيرفر الأساطير');
    expect(p).toContain('بالعربية');
    expect(p).toContain('سيرفر الأساطير');
  });
  it('non-Arabic guilds get a prompt in-language instruction', () => {
    const p = buildSystemPrompt('X', { language: 'de' });
    expect(p).toContain('German');
  });
  it('comedic option changes the prompt', () => {
    const base = buildSystemPrompt('X');
    const funny = buildSystemPrompt('X', { comedic: true });
    expect(funny).not.toBe(base);
    expect(funny).toMatch(/كوميدي|مضحك|نكت/);
  });
});
