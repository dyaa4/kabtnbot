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

  // Fuzzy tolerance: Whisper drops/substitutes single letters and prepends
  // fillers. A near-miss must still wake the bot — with guards so ordinary
  // chatter does not.
  describe('fuzzy tolerance', () => {
    it('tolerates one dropped letter', () => {
      expect(parseWakeWord('يا كبتن اطلع', 'يا كابتن')).toBe('اطلع');
    });
    it('tolerates one substituted letter', () => {
      expect(parseWakeWord('يا كابطن اسكت', 'يا كابتن')).toBe('اسكت');
    });
    it('tolerates up to two leading filler words', () => {
      expect(parseWakeWord('اه يا كابتن اطلع', 'يا كابتن')).toBe('اطلع');
      expect(parseWakeWord('طيب اه يا كابتن قف', 'يا كابتن')).toBe('قف');
    });
    it('tolerates the wake word split into extra tokens by STT', () => {
      expect(parseWakeWord('يا كاب تن وزع', 'يا كابتن')).toBe('وزع');
    });
    it('still ignores unrelated words of similar length', () => {
      expect(parseWakeWord('يا شباب كيفكم', 'يا كابتن')).toBeNull();
    });
    it('rejects a 2-edit near-miss whose first letter differs (talking ABOUT the bot)', () => {
      expect(parseWakeWord('الكابتن راح', 'يا كابتن')).toBeNull();
    });
    it('keeps short wake words strict (no fuzzy budget)', () => {
      expect(parseWakeWord('بولت اسكت', 'بوت')).toBeNull();
    });
    it('does not fire deep inside a sentence', () => {
      expect(parseWakeWord('قلت له امس يا كابتن اطلع', 'يا كابتن')).toBeNull();
    });

    // Short wake words ("عرب") get no edit budget, but Whisper almost never
    // emits them bare — it produces "العرب" / "عربي" / "أعرب". Containment
    // (whole wake word inside the token, ≤2 extra letters) covers those
    // without opening the 1-edit floodgate (غرب/قرب/حرب must stay silent).
    it('containment: definite article and suffix variants of a short wake word', () => {
      expect(parseWakeWord('العرب اطلع', 'عرب')).toBe('اطلع');
      expect(parseWakeWord('عربي اسكت', 'عرب')).toBe('اسكت');
      expect(parseWakeWord('أعرب قف', 'عرب')).toBe('قف'); // أ folds to ا
    });
    it('containment does not loosen into 1-edit lookalikes', () => {
      expect(parseWakeWord('غرب اطلع', 'عرب')).toBeNull();
      expect(parseWakeWord('قرب اسكت', 'عرب')).toBeNull();
      expect(parseWakeWord('حرب قامت', 'عرب')).toBeNull();
    });
    it('containment respects the ≤2 extra letters cap', () => {
      expect(parseWakeWord('عربيتين جو', 'عرب')).toBeNull(); // 5 extra letters
    });

    // Reverse containment: speakers habitually drop the "يا" vocative — the
    // core of the wake word alone (≥3 letters, ≤2 letters missing) must wake.
    it('the wake word core without the vocative still wakes', () => {
      expect(parseWakeWord('عرب اسكت', 'يا عرب')).toBe('اسكت');
      expect(parseWakeWord('كابتن اطلع', 'يا كابتن')).toBe('اطلع');
    });
    it('a tiny fragment of the wake word does not wake', () => {
      expect(parseWakeWord('كاب اطلع', 'يا كابتن')).toBeNull(); // 5 letters missing
      expect(parseWakeWord('يا اطلع', 'يا كابتن')).toBeNull(); // fragment under 3 letters
    });
  });
});
