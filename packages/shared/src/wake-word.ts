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
  const m = t.match(new RegExp(`^${escaped}[\\s,،.!؟]*(.*)$`, 'i'));
  return m ? m[1].trim() : null;
}
