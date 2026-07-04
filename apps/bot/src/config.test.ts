import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';
import { ENV_FILE } from './config.js';

describe('config env resolution', () => {
  it('resolves the .env at the repo root regardless of CWD', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    expect(ENV_FILE).toBe(path.join(repoRoot, '.env'));
  });
});
