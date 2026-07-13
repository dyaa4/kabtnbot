import { normalizeText } from './moderation.js';

/**
 * If `text` begins with `wakeWord` (spaces inside the wake word optional),
 * return the remainder (trimmed, '' if nothing follows). Otherwise null.
 *
 * Both sides are folded with normalizeText — the SAME normalization the profanity
 * filter uses (alef forms أإآٱ→ا, ة→ه, ى→ي, tatweel, diacritics, 3+ elongation).
 * Whisper spells the wake word inconsistently (يا كابتن / يا كابتـن / يا كابتنّ),
 * so without this folding the strict prefix match silently fails and the bot never
 * answers — exactly the "doesn't react to the wake word" symptom.
 */
export function parseWakeWord(text: string, wakeWord: string): string | null {
  const t = normalizeText(text);
  const w = normalizeText(wakeWord);
  if (!w) return null;
  const escaped = w
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, '\\s*');
  // The wake word must be a whole word: either the utterance ends right after
  // it, or a space/punctuation follows. Without this boundary a short wake
  // word matches as a raw prefix inside longer words (wake "بوت" would fire
  // on "بوتات جديدة") and feeds garbage args to the AI.
  const m = t.match(new RegExp(`^${escaped}(?:[\\s,،.!؟]+(.*))?$`, 'i'));
  if (m) return (m[1] ?? '').trim();
  return fuzzyWakeMatch(t, w);
}

// Edit-distance budget by wake-word length: short words stay strict (a 1-edit
// window on 3 letters matches half the dictionary), longer ones absorb the
// 1–2 letter drops/substitutions Whisper produces.
function fuzzyBudget(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

/**
 * Tolerant fallback when the strict prefix regex misses: Whisper drops or
 * substitutes single letters ("يا كبتن"), splits the wake word into extra
 * tokens ("يا كاب تن"), or the speaker prepends fillers ("اه يا كابتن").
 *
 * Guards against false wakes:
 * - the match must start within the first 3 tokens (never deep mid-sentence),
 * - candidates are compared space-free against the wake word with a length-
 *   scaled edit budget,
 * - a 2+-edit match must still start with the wake word's first letter
 *   (rejects "الكابتن …" = talking ABOUT the bot, not TO it).
 */
function fuzzyWakeMatch(t: string, w: string): string | null {
  const wCompact = w.replace(/ /g, '');
  const budget = fuzzyBudget(wCompact.length);
  const tokens = t.split(/[\s,،.!؟?]+/).filter(Boolean);

  for (let start = 0; start < Math.min(3, tokens.length); start++) {
    // Best span at this start — smallest edit distance wins, longer span
    // breaks ties so a split wake word ("يا كاب تن") is consumed fully and
    // its tail does not leak into the args.
    let best: { span: number; dist: number } | null = null;
    for (let span = 1; span <= Math.min(3, tokens.length - start); span++) {
      const cand = tokens.slice(start, start + span).join('');
      if (Math.abs(cand.length - wCompact.length) > budget) continue;
      const dist = levenshtein(cand, wCompact);
      if (dist > budget) continue;
      if (dist >= 2 && cand[0] !== wCompact[0]) continue;
      if (!best || dist < best.dist || (dist === best.dist && span > best.span)) {
        best = { span, dist };
      }
    }
    if (best) return tokens.slice(start + best.span).join(' ').trim();
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = prev[j];
      prev[j] = cur;
    }
  }
  return prev[b.length];
}
