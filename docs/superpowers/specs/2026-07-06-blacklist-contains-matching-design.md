# Blacklist: Contains-Matching für Custom Words (Hybrid)

**Datum:** 2026-07-06 · **Status:** genehmigt

## Problem

`matchesProfanity` (packages/shared/src/moderation.ts) matcht alle Wörter nur an
Wortgrenzen. Admin-Custom-Words fangen dadurch weder Zusammenschreibungen noch
Vorkommen innerhalb anderer Wörter — obwohl der UI-Hinweis bereits „أي رسالة
تحتوي إحدى هذه الكلمات" (contains) verspricht.

## Entscheidung: Hybrid

1. **Custom Words → Substring (contains).** Nach `normalizeText` (Lowercase,
   Diacritics, Alef-Varianten, Tatweel, Elongation) reicht ein Vorkommen
   irgendwo im normalisierten Text. Die ة/ه/ا-Endungstoleranz (Whisper-STT)
   bleibt erhalten. Schutz: Einträge mit nur 1 normalisierten Zeichen fallen
   auf Wortgrenzen-Matching zurück (sonst blockt z. B. „ا" fast alles).
2. **Builtin-Liste → Wortgrenzen wie bisher, plus angehängte arabische
   Präfixe** `و ف ب ك ل ال` und Kombinationen (وال، بال، لل …) vor dem Wort:
   والكلب، بالخرا، للحمار matchen jetzt. Klitika-Suffixe (كسك، طيزها)
   unverändert.
3. **Bewusster Verzicht:** Builtin-Englisch bleibt ohne Substring
   (cocktail/class/Dickens-Problem). Wer Zusammenschreibungen wie „fuckyou"
   fangen will, trägt das Wort als Custom Word ein.

## Wirkung

Text- und Voice-Moderation nutzen beide `scanMessage`/`matchesProfanity` —
die Änderung greift überall. Bestehende Tests, die Custom-Word-Grenzverhalten
dokumentierten, wechseln auf die Builtin-Pfade (كس، زب sind builtin); neue
Tests decken contains, 1-Zeichen-Fallback und Präfixe ab.
