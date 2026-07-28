import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';
import { ENV_FILE, parseIdList } from './config.js';

describe('config env resolution', () => {
  it('resolves the .env at the repo root regardless of CWD', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    expect(ENV_FILE).toBe(path.join(repoRoot, '.env'));
  });
});

describe('parseIdList', () => {
  it('trims and drops blanks', () => {
    expect(parseIdList(' a , b ,,')).toEqual(['a', 'b']);
  });

  // SUPER_ADMINS_IDS is the misspelling the owner actually typed into Railway.
  // It left the id list empty, so the owner was told the monthly AI questions
  // had run out on his own server.
  it('merges both spellings of the super-admin variable', () => {
    expect(parseIdList('', 'a,b')).toEqual(['a', 'b']);
    expect(parseIdList('a', 'b')).toEqual(['a', 'b']);
  });
});
