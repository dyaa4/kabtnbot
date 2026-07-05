import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompts.js';

describe('buildSystemPrompt', () => {
  it('injects dialect instruction and guild name', () => {
    const p = buildSystemPrompt('gulf', 'سيرفر الأساطير');
    expect(p).toContain('الخليجية');
    expect(p).toContain('سيرفر الأساطير');
  });
  it('every dialect yields a distinct prompt', () => {
    const all = (['gulf', 'syrian', 'egyptian', 'msa'] as const).map((d) => buildSystemPrompt(d, 'x'));
    expect(new Set(all).size).toBe(4);
  });
  it('comedic option changes the prompt', () => {
    const base = buildSystemPrompt('gulf', 'X');
    const funny = buildSystemPrompt('gulf', 'X', { comedic: true });
    expect(funny).not.toBe(base);
    expect(funny).toMatch(/كوميدي|مضحك|نكت/);
  });
});
