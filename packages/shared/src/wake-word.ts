/** Strip Arabic diacritics and collapse whitespace. */
function normalize(s: string): string {
  return s.trim().replace(/[ً-ْ]/g, '').replace(/\s+/g, ' ');
}

/**
 * If `text` begins with `wakeWord` (spaces inside the wake word optional),
 * return the remainder (trimmed, '' if nothing follows). Otherwise null.
 */
export function parseWakeWord(text: string, wakeWord: string): string | null {
  const t = normalize(text);
  const escaped = normalize(wakeWord)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, '\\s*');
  const m = t.match(new RegExp(`^${escaped}[\\s,،.!؟]*(.*)$`, 'i'));
  return m ? m[1].trim() : null;
}
