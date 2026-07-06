import { describe, it, expect } from 'vitest';
import { LANGUAGES } from '@gamebot/shared';
import { DICTS, t, S, fmt } from './strings.js';
import { ar } from './strings/ar.js';

describe('bot string dictionaries', () => {
  it('covers every supported language', () => {
    for (const lang of LANGUAGES) expect(DICTS[lang]).toBeDefined();
  });

  it('every language has exactly the keys of the Arabic reference', () => {
    const reference = Object.keys(ar).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(DICTS[lang]).sort(), `keys of '${lang}'`).toEqual(reference);
    }
  });

  it('placeholders survive translation ({user}, {server}, …)', () => {
    const placeholdersOf = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(ar) as (keyof typeof ar)[]) {
      const expected = placeholdersOf(ar[key]);
      for (const lang of LANGUAGES) {
        expect(placeholdersOf(DICTS[lang][key]), `placeholders of ${lang}.${key}`).toEqual(expected);
      }
    }
  });

  it('t falls back to Arabic and S is the Arabic dictionary', () => {
    expect(t('ar')).toBe(S);
    expect(S.genericError).toContain('❌');
  });

  it('fmt substitutes variables and leaves unknown ones visible', () => {
    expect(fmt('hi {user} in {server}', { user: 'x', server: 'y' })).toBe('hi x in y');
    expect(fmt('hi {missing}', {})).toBe('hi {missing}');
  });
});
