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
  it('an Arabic dialect instructs the model to write in that dialect', () => {
    expect(buildSystemPrompt('X', { dialect: 'egyptian' })).toContain('اللهجة المصرية');
    expect(buildSystemPrompt('X', { dialect: 'levantine' })).toContain('اللهجة الشامية');
    expect(buildSystemPrompt('X', { dialect: 'gulf' })).toContain('اللهجة الخليجية');
  });
  it('msa keeps the neutral Arabic rule (no dialect line)', () => {
    const p = buildSystemPrompt('X', { dialect: 'msa' });
    expect(p).not.toContain('اللهجة');
  });
  it('dialect is ignored for non-Arabic guilds', () => {
    const p = buildSystemPrompt('X', { language: 'de', dialect: 'egyptian' });
    expect(p).not.toContain('اللهجة');
    expect(p).toContain('German');
  });
});
