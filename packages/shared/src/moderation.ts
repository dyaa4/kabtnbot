// Built-in bilingual blocklist for the voice/text moderation filter. These are
// matched (not used) — the whole point is to detect and block them. normalizeText
// folds spelling variants (alef/ta-marbuta/alef-maqsura/tatweel/diacritics/elongation),
// so each entry also covers its variants. Admins extend this via custom_words.
const BUILTIN_PROFANITY = [
  // English profanity + slurs
  'fuck', 'fuk', 'fucker', 'motherfucker', 'fucking', 'shit', 'bullshit', 'bitch',
  'asshole', 'dumbass', 'jackass', 'bastard', 'dick', 'dickhead', 'cock', 'pussy',
  'cunt', 'whore', 'slut', 'faggot', 'fag', 'nigger', 'nigga', 'retard', 'retarded',
  'moron', 'idiot', 'stupid', 'wanker', 'prick', 'twat', 'douchebag', 'skank',
  'spic', 'chink', 'kike', 'coon',
  // Arabic profanity + insults (write natural forms; normalizeText handles variants)
  'كس', 'كسمك', 'كسختك', 'طيز', 'زب', 'زبي', 'خرا', 'عرص', 'شرموط', 'شرموطة',
  'قحبة', 'منيك', 'منيوك', 'نيك', 'انيك', 'يلعن', 'لعنة', 'حمار', 'كلب', 'خنزير',
  'نجس', 'وسخ', 'غبي', 'حقير', 'متخلف', 'معفن', 'لوطي', 'خول', 'داعر', 'زانية',
  'ملعون', 'حيوان', 'بهيمة', 'منحط',
];

const SHORTENERS = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd', 'cutt.ly', 'rb.gy'];
const SCAM_DOMAIN_HINTS = ['d1scord', 'discordnitro', 'discordgift', 'steamcommunity-', 'steamgift', 'free-nitro'];
const SCAM_PHRASES = [/free\s+nitro/i, /steam\s+gift/i, /nitro\s+giveaway/i, /claim\s+your\s+(free\s+)?nitro/i];
const URL_RE = /\bhttps?:\/\/[^\s]+|\b[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/gi;
const INVITE_RE = /\b(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-z0-9-]+/i;

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '') // Arabic diacritics (tashkeel)
    .replace(/ـ/g, '') // tatweel ـ
    .replace(/[أإآٱ]/g, 'ا') // unify alef forms → ا
    .replace(/ة/g, 'ه') // ta-marbuta → ha
    .replace(/ى/g, 'ي') // alef-maqsura → ya
    .replace(/(.)\1{2,}/g, '$1') // 3+ repeats → 1 (elongation)
    .replace(/\s+/g, ' ')
    .trim();
}

function domainOf(token: string): string | null {
  const m = token.match(/^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : null;
}

// Arabic possessive/object clitics that attach to the end of a word with no space
// (كسك، طيزها، زبه …). Allowing one optional trailing clitic catches the inflected
// forms without loosening to substring matching — the word still has to start at a
// token boundary, so roots inside innocent words (مكسور، كسر، كسل) stay unmatched.
const AR_SUFFIXES = 'ها|هم|هن|كم|كن|نا|ني|ه|ك|ي';

// Arabic conjunction/preposition/article prefixes that attach to the front of a
// word with no space (والكلب، بالخرا، للحمار). Up to two single-letter prefixes
// plus an optional article covers the common stacks (و+ال، ب+ال، ل+ل …).
const AR_PREFIXES = '(?:[وفبكل]{0,2}(?:ال)?)?';

// Whisper renders a word-final ta-marbuta (ة, normalized to ه) as ه or ا
// inconsistently, so let a trailing ه/ا in the entry match either ending.
function bodyOf(nw: string): string {
  return /[ها]$/.test(nw) ? `${escapeRe(nw.slice(0, -1))}[ها]` : escapeRe(nw);
}

function boundaryHit(normalizedText: string, nw: string): boolean {
  return new RegExp(`(^|[^\\p{L}])${AR_PREFIXES}${bodyOf(nw)}(?:${AR_SUFFIXES})?([^\\p{L}]|$)`, 'u').test(
    ` ${normalizedText} `,
  );
}

export function matchesProfanity(text: string, customWords: string[]): boolean {
  const n = normalizeText(text);
  // Built-in entries stay boundary-anchored: substring matching would flag
  // innocent same-root words (كس→مكسور, ass→class).
  if (BUILTIN_PROFANITY.some((w) => boundaryHit(n, normalizeText(w)))) return true;
  // Admin custom words match anywhere in the text (contains) — the admin chose
  // them deliberately, and the dashboard promises containment. Single-character
  // entries keep boundary matching so they can't blanket-match every word.
  return customWords.some((w) => {
    const nw = normalizeText(w);
    if (!nw) return false;
    if (nw.length < 2) return boundaryHit(n, nw);
    return new RegExp(bodyOf(nw), 'u').test(n);
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scanMessage(
  content: string,
  opts: { customWords: string[]; allowedDomains: string[] },
): { blocked: boolean; reason: 'scam' | 'invite' | 'shortener' | 'word' | null } {
  const allowed = new Set(opts.allowedDomains.map((d) => d.toLowerCase().replace(/^www\./, '')));

  if (INVITE_RE.test(content)) return { blocked: true, reason: 'invite' };
  if (SCAM_PHRASES.some((re) => re.test(content))) return { blocked: true, reason: 'scam' };

  const urls = content.match(URL_RE) ?? [];
  for (const url of urls) {
    const domain = domainOf(url);
    if (!domain || allowed.has(domain)) continue;
    if (SHORTENERS.includes(domain)) return { blocked: true, reason: 'shortener' };
    if (SCAM_DOMAIN_HINTS.some((h) => domain.includes(h))) return { blocked: true, reason: 'scam' };
  }

  if (matchesProfanity(content, opts.customWords)) return { blocked: true, reason: 'word' };
  return { blocked: false, reason: null };
}
