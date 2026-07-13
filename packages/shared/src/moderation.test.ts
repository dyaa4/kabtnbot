import { describe, it, expect } from 'vitest';
import { normalizeText, matchesProfanity, findProfanity, scanMessage } from './moderation.js';

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
  it('built-in matching does not turn innocent same-root words into matches', () => {
    // كس and زب are built-in entries; the boundary keeps same-root words clean
    expect(matchesProfanity('هاتفي مكسور', [])).toBe(false); // مكسور (broken)
    expect(matchesProfanity('كسر الكوب', [])).toBe(false); // كسر (to break)
    expect(matchesProfanity('عندي كسل اليوم', [])).toBe(false); // كسل (laziness)
    expect(matchesProfanity('جاء الزبون', [])).toBe(false); // زبون (customer)
  });
  it('matches built-in words behind attached Arabic prefixes (وال، بال، لل …)', () => {
    expect(matchesProfanity('روح والكلب معك', [])).toBe(true); // و+ال+كلب
    expect(matchesProfanity('هذا بالخرا', [])).toBe(true); // ب+ال+خرا
    expect(matchesProfanity('قلت للحمار', [])).toBe(true); // لل+حمار
  });
  it('prefix matching skips two-letter roots — gaming words like بوكس/فكس stay clean', () => {
    expect(matchesProfanity('ضربته بوكس قوي', [])).toBe(false); // بو+كس ≠ profanity
    expect(matchesProfanity('سوي فكس للسيرفر', [])).toBe(false); // ف+كس ≠ profanity
    expect(matchesProfanity('اعطيه وكس؟ لا', [])).toBe(false); // و+كس
    // the clitic-suffix path on short roots is unaffected
    expect(matchesProfanity('يا كسك', [])).toBe(true);
    expect(matchesProfanity('انت كس', [])).toBe(true);
  });
  it('custom words of 3+ letters match as substrings anywhere in the text (admin opted in)', () => {
    // inside another word / written together
    expect(matchesProfanity('he said fuckyou loudly', ['fuckyou'])).toBe(true);
    expect(matchesProfanity('xxspamwordxx', ['spamword'])).toBe(true);
    // normalization still applies to both sides
    expect(matchesProfanity('قال حِمَآريات', ['حمار'])).toBe(true);
    // clean text stays clean
    expect(matchesProfanity('good game everyone', ['spamword'])).toBe(false);
  });
  it('custom entries under 3 letters fall back to boundary matching', () => {
    // A two-letter Arabic root as a substring would swallow innocent gaming
    // words (كس inside بوكس "punch", فكس "fix") — the known false-kick class.
    expect(matchesProfanity('ضربته بوكس قوي', ['كس'])).toBe(false);
    expect(matchesProfanity('هاتفي مكسور', ['كس'])).toBe(false);
    expect(matchesProfanity('انت كس', ['كس'])).toBe(true); // standalone token still matches
    expect(matchesProfanity('يا كسك', ['كس'])).toBe(true); // clitic suffix still matches
    expect(matchesProfanity('باب مفتوح', ['ب'])).toBe(false); // no substring explosion
    expect(matchesProfanity('قال ب صوت عالي', ['ب'])).toBe(true); // standalone token still matches
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

describe('findProfanity', () => {
  it('returns the offending source word so moderation can log what tripped', () => {
    expect(findProfanity('you are an idiot', [])).toBe('idiot');
    expect(findProfanity('روح يا كلب', [])).toBe('كلب');
    expect(findProfanity('this is badcustom', ['badcustom'])).toBe('badcustom');
  });
  it('returns null for clean text', () => {
    expect(findProfanity('good game everyone', [])).toBeNull();
    expect(findProfanity('يعطيك العافية يا بطل', [])).toBeNull();
  });
});

describe('scanMessage', () => {
  it('blocks known nitro/steam scam phrasing with a link', () => {
    expect(scanMessage('free nitro here http://d1scord-nitro.ru/x', { customWords: [], blockedDomains: [] }).blocked).toBe(true);
  });
  it('blocks foreign discord invites', () => {
    expect(scanMessage('join discord.gg/abc123', { customWords: [], blockedDomains: [] }).reason).toBe('invite');
  });
  it('blocks url shorteners', () => {
    expect(scanMessage('look bit.ly/xyz', { customWords: [], blockedDomains: [] }).reason).toBe('shortener');
  });
  it('passes ordinary links (youtube) and clean text', () => {
    expect(scanMessage('watch https://youtube.com/watch?v=1', { customWords: [], blockedDomains: [] }).blocked).toBe(false);
    expect(scanMessage('gg wp everyone', { customWords: [], blockedDomains: [] }).blocked).toBe(false);
  });
  it('blocks links to admin-blocked domains, including subdomains', () => {
    const opts = { customWords: [], blockedDomains: ['example.com'] };
    expect(scanMessage('my site shop.example.com/a', opts).reason).toBe('domain');
    expect(scanMessage('go to https://example.com/x', opts).reason).toBe('domain');
    expect(scanMessage('see notexample.org/a', opts).blocked).toBe(false);
  });
  it('blocks an admin custom word', () => {
    expect(scanMessage('this is spamword', { customWords: ['spamword'], blockedDomains: [] }).reason).toBe('word');
  });
});
