import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ar from './locales/ar.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

const CLIENT_DIR = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'locales') continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(name) && !name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** All literal t('...') / t("...") keys in the client source. Dynamic keys
 *  (template literals) are not scannable and are covered by the parity check. */
function usedLiteralKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of sourceFiles(CLIENT_DIR)) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(/\bt\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      keys.add(match[1]);
    }
  }
  return keys;
}

describe('i18n locale files', () => {
  it('ar.json and en.json define exactly the same keys', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('every t() key used literally in the client exists in the locales', () => {
    const dict = ar as Record<string, string>;
    const missing = [...usedLiteralKeys()].filter((key) => !(key in dict));
    expect(missing).toEqual([]);
  });

  it('locale values are non-empty', () => {
    for (const [key, value] of Object.entries(ar as Record<string, string>)) {
      expect(value.length, `ar: ${key}`).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(en as Record<string, string>)) {
      expect(value.length, `en: ${key}`).toBeGreaterThan(0);
    }
  });
});
