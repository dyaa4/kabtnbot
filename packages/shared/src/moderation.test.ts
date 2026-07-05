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
  it('treats a word-final ة/ه/ا as interchangeable (Whisper STT ambiguity)', () => {
    // entry ends in ta-marbuta, STT rendered the ending as alef → still matches
    expect(matchesProfanity('قال زنبورا', ['زنبورة'])).toBe(true);
    // and if the admin typed the alef form, an STT ha/ta ending still matches
    expect(matchesProfanity('قال زنبوره', ['زنبورا'])).toBe(true);
    expect(matchesProfanity('يا قحبه', ['قحبة'])).toBe(true);
    // but it must not turn an unrelated clean word into a match
    expect(matchesProfanity('مرحبا يا شباب', ['زنبورة'])).toBe(false);
  });
  it('matches an entry with an attached Arabic possessive/object suffix (كسك، طيزها، زبه)', () => {
    expect(matchesProfanity('يا كسك', ['كس'])).toBe(true);
    expect(matchesProfanity('شفت طيزها', ['طيز'])).toBe(true);
    expect(matchesProfanity('قطع زبه', ['زب'])).toBe(true);
    expect(matchesProfanity('روح يا كلبهم', [])).toBe(true); // built-in كلب + هم
  });
  it('suffix matching does not turn innocent same-root words into matches', () => {
    // a leading letter before the root fails the boundary (no prefix matching)
    expect(matchesProfanity('هاتفي مكسور', ['كس'])).toBe(false); // مكسور (broken)
    // trailing letters that are not clitics keep the word clean
    expect(matchesProfanity('كسر الكوب', ['كس'])).toBe(false); // كسر (to break)
    expect(matchesProfanity('عندي كسل اليوم', ['كس'])).toBe(false); // كسل (laziness)
    expect(matchesProfanity('جاء الزبون', ['زب'])).toBe(false); // زبون (customer)
  });
  it('ships a bilingual built-in blocklist (no custom words needed)', () => {
    // representative English
    for (const s of ['you fucking noob', 'what a bitch', 'go to hell asshole']) {
      expect(matchesProfanity(s, [])).toBe(true);
    }
    // representative Arabic
    for (const s of ['يا كلب', 'انت عرص', 'روح يا خرا']) {
      expect(matchesProfanity(s, [])).toBe(true);
    }
    // clean text in both languages stays clean
    expect(matchesProfanity('good game everyone', [])).toBe(false);
    expect(matchesProfanity('يعطيك العافية يا بطل', [])).toBe(false);
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
