const BUILTIN_PROFANITY = [
  // English (kept intentionally mild in source; extend as needed)
  'idiot', 'stupid', 'moron', 'bastard', 'asshole',
  // Arabic (common insults)
  'حيوان', 'غبي', 'كلب', 'حقير', 'وسخ',
];

const SHORTENERS = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd', 'cutt.ly', 'rb.gy'];
const SCAM_DOMAIN_HINTS = ['d1scord', 'discordnitro', 'discordgift', 'steamcommunity-', 'steamgift', 'free-nitro'];
const SCAM_PHRASES = [/free\s+nitro/i, /steam\s+gift/i, /nitro\s+giveaway/i, /claim\s+your\s+(free\s+)?nitro/i];
const URL_RE = /\bhttps?:\/\/[^\s]+|\b[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/gi;
const INVITE_RE = /\b(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-z0-9-]+/i;

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '') // Arabic diacritics
    .replace(/(.)\1{2,}/g, '$1') // 3+ repeats → 1
    .replace(/\s+/g, ' ')
    .trim();
}

function domainOf(token: string): string | null {
  const m = token.match(/^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : null;
}

export function matchesProfanity(text: string, customWords: string[]): boolean {
  const n = normalizeText(text);
  const words = [...BUILTIN_PROFANITY, ...customWords.map((w) => w.toLowerCase())];
  return words.some((w) => {
    const nw = normalizeText(w);
    if (!nw) return false;
    return new RegExp(`(^|[^\\p{L}])${escapeRe(nw)}([^\\p{L}]|$)`, 'u').test(` ${n} `);
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
