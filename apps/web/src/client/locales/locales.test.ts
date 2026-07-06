import { describe, it, expect } from 'vitest';
import ar from './ar.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };
import tr from './tr.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import ru from './ru.json' with { type: 'json' };

const LOCALES = { en, de, tr, fr, ru } as Record<string, Record<string, string>>;

describe('web locales', () => {
  it('every locale has exactly the keys of the Arabic reference', () => {
    const reference = Object.keys(ar).sort();
    for (const [name, dict] of Object.entries(LOCALES)) {
      expect(Object.keys(dict).sort(), `keys of '${name}'`).toEqual(reference);
    }
  });

  it('placeholders like {count} survive translation', () => {
    const placeholdersOf = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(ar)) {
      const expected = placeholdersOf((ar as Record<string, string>)[key]);
      for (const [name, dict] of Object.entries(LOCALES)) {
        expect(placeholdersOf(dict[key]), `placeholders of ${name}.${key}`).toEqual(expected);
      }
    }
  });
});
