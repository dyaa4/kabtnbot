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

  // Whisper spells the same wake word inconsistently; full normalization must
  // fold those variants or the bot silently never answers.
  it('matches across ta-marbuta / alef-maqsura variance', () => {
    expect(parseWakeWord('يا كابتنه وزع الفرق', 'يا كابتنة')).toBe('وزع الفرق'); // ة↔ه
    expect(parseWakeWord('يا مولي ساعد', 'يا مولى')).toBe('ساعد'); // ى↔ي
  });
  it('matches across alef-hamza and tatweel variance', () => {
    expect(parseWakeWord('يا احمد اسكت', 'يا أحمد')).toBe('اسكت'); // أ↔ا
    expect(parseWakeWord('يا كابتـن قف', 'يا كابتن')).toBe('قف'); // tatweel stripped
  });
  it('matches despite elongation (3+ repeated letters)', () => {
    expect(parseWakeWord('يا كابتننننن وزع', 'يا كابتن')).toBe('وزع');
  });
});
