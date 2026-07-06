import { describe, it, expect } from 'vitest';
import { registerCommands } from './index.js';

describe('registerCommands', () => {
  it('registers unique command names including ping and welcome-test', () => {
    const map = registerCommands();
    expect(map.has('ping')).toBe(true);
    expect(map.has('welcome-test')).toBe(true);
    expect(map.size).toBeGreaterThan(0);
  });
});
