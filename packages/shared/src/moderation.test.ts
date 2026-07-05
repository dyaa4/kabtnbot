import { describe, it, expect } from 'vitest';
import { normalizeText, matchesProfanity, scanMessage } from './moderation.js';

describe('normalizeText', () => {
  it('lowercases, strips diacritics, collapses elongation', () => {
    expect(normalizeText('HELLOOOO')).toBe('hello');
    expect(normalizeText('كلْمَة')).toBe('كلمه'); // ة → ه
  });
  it('unifies Arabic letter variants (alef, ta-marbuta, alef-maqsura, tatweel)', () => {
    // all alef forms → ا (each individually)
    expect(normalizeText('أ')).toBe('ا');
    expect(normalizeText('إ')).toBe('ا');
    expect(normalizeText('آ')).toBe('ا');
    expect(normalizeText('أحمد')).toBe(normalizeText('احمد'));
    // ta-marbuta → ha, alef-maqsura → ya
    expect(normalizeText('مدرسة')).toBe(normalizeText('مدرسه'));
    expect(normalizeText('على')).toBe(normalizeText('علي'));
    // tatweel removed
    expect(normalizeText('كــلمة')).toBe('كلمه');
  });
});

describe('matchesProfanity', () => {
  it('matches a built-in bad word and a custom word, ignores clean text', () => {
    expect(matchesProfanity('you are an idiot', [])).toBe(true); // 'idiot' built-in
    expect(matchesProfanity('مرحبا يا شباب', [])).toBe(false);
    expect(matchesProfanity('this is badcustom', ['badcustom'])).toBe(true);
  });
  it('sees through simple elongation obfuscation', () => {
    expect(matchesProfanity('idioooot', [])).toBe(true);
  });
  it('one Arabic list entry matches its spelling variants automatically', () => {
    // entry written with ta-marbuta matches text with ha, and vice-versa
    expect(matchesProfanity('قال كلمه بذيئه', ['بذيئة'])).toBe(true);
    // entry with alef-maqsura matches alef-variant + tatweel + diacritics
    expect(matchesProfanity('يا حمــار', ['حمار'])).toBe(true);
    expect(matchesProfanity('أنت حِمَآر', ['حمار'])).toBe(true);
  });
});

describe('scanMessage', () => {
  it('blocks known nitro/steam scam phrasing with a link', () => {
    expect(scanMessage('free nitro here http://d1scord-nitro.ru/x', { customWords: [], allowedDomains: [] }).blocked).toBe(true);
  });
  it('blocks foreign discord invites', () => {
    expect(scanMessage('join discord.gg/abc123', { customWords: [], allowedDomains: [] }).reason).toBe('invite');
  });
  it('blocks url shorteners', () => {
    expect(scanMessage('look bit.ly/xyz', { customWords: [], allowedDomains: [] }).reason).toBe('shortener');
  });
  it('passes ordinary links (youtube) and clean text', () => {
    expect(scanMessage('watch https://youtube.com/watch?v=1', { customWords: [], allowedDomains: [] }).blocked).toBe(false);
    expect(scanMessage('gg wp everyone', { customWords: [], allowedDomains: [] }).blocked).toBe(false);
  });
  it('passes a link whose domain is admin-allowed', () => {
    expect(scanMessage('my site shop.example.com/a', { customWords: [], allowedDomains: ['shop.example.com'] }).blocked).toBe(false);
  });
  it('blocks an admin custom word', () => {
    expect(scanMessage('this is spamword', { customWords: ['spamword'], allowedDomains: [] }).reason).toBe('word');
  });
});
