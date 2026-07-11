import { describe, it, expect } from 'vitest';
import { parseIntentReply } from './intent.js';
import { checkCooldown, clearCooldowns } from './cooldown.js';

const ids = new Set(['f1', 'f2']);

describe('parseIntentReply', () => {
  it('accepts plain minified JSON with a known id', () => {
    expect(parseIntentReply('{"command_id":"f1"}', ids)).toBe('f1');
  });
  it('strips code fences and surrounding chatter', () => {
    expect(parseIntentReply('Sure!\n```json\n{"command_id": "f2"}\n```', ids)).toBe('f2');
  });
  it('null command_id → null', () => {
    expect(parseIntentReply('{"command_id":null}', ids)).toBeNull();
  });
  it('unknown id → null (model may hallucinate)', () => {
    expect(parseIntentReply('{"command_id":"f9"}', ids)).toBeNull();
  });
  it('garbage → null, never throws', () => {
    expect(parseIntentReply('the user wants to leave', ids)).toBeNull();
    expect(parseIntentReply('{broken json', ids)).toBeNull();
    expect(parseIntentReply('', ids)).toBeNull();
  });
});

describe('checkCooldown', () => {
  it('allows first run, blocks inside the window, allows after it', () => {
    clearCooldowns();
    expect(checkCooldown('g:f:u', 5, 1_000)).toBe(true);
    expect(checkCooldown('g:f:u', 5, 3_000)).toBe(false);
    expect(checkCooldown('g:f:u', 5, 6_001)).toBe(true);
  });
  it('cooldown 0 never blocks', () => {
    clearCooldowns();
    expect(checkCooldown('g:f:u', 0, 1_000)).toBe(true);
    expect(checkCooldown('g:f:u', 0, 1_000)).toBe(true);
  });
  it('keys are independent per user', () => {
    clearCooldowns();
    expect(checkCooldown('g:f:u1', 5, 1_000)).toBe(true);
    expect(checkCooldown('g:f:u2', 5, 1_000)).toBe(true);
  });
});
