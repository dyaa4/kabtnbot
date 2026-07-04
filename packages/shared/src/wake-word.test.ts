import { describe, it, expect } from 'vitest';
import { parseWakeWord } from './wake-word.js';

describe('parseWakeWord', () => {
  it('extracts command after wake word', () => {
    expect(parseWakeWord('يا بوت وزع الفرق', 'يا بوت')).toBe('وزع الفرق');
  });
  it('tolerates missing space inside wake word', () => {
    expect(parseWakeWord('يابوت اسكت', 'يا بوت')).toBe('اسكت');
  });
  it('tolerates punctuation after wake word', () => {
    expect(parseWakeWord('يا بوت، ساعد', 'يا بوت')).toBe('ساعد');
  });
  it('returns empty string for bare wake word', () => {
    expect(parseWakeWord('يا بوت', 'يا بوت')).toBe('');
  });
  it('returns null when no wake word', () => {
    expect(parseWakeWord('كيف الحال', 'يا بوت')).toBeNull();
  });
});
