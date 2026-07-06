# Mehrsprachigkeit: Bot-Systemtexte + Web-Plattform

**Datum:** 2026-07-06 · **Status:** genehmigt

## Umfang

Sechs Sprachen: **ar (Standard), en, de, tr, fr, ru** — auf der Web-Plattform
(Landing + Dashboard) und für die Bot-Systemtexte pro Server. Der
Voice-Assistent (Wake-Word, STT/TTS, Dialekte) bleibt bewusst arabisch; nur
seine System-/Fehlermeldungen (Quota, „geh in einen Voice-Raum" …) werden
lokalisiert. Übersetzungen sind AI-generiert — Review durch Muttersprachler
empfohlen.

## Architektur

### Shared (`packages/shared`)

- `LANGUAGES = ['ar','en','de','tr','fr','ru'] as const` + Typ `Language`.
- Guild-Schema: `language: z.enum(LANGUAGES).default('ar')` (vorher
  `z.literal('ar')`). Bestehende Server bleiben arabisch — keine Migration.
- Willkommens-/Abschieds-Defaults: Schema-Default wird `''`; leer heißt
  „nutze den lokalisierten Standardtext". Der Bot löst zur Sendezeit
  `message || defaultWelcome(lang)` auf. Server mit bereits gespeichertem
  arabischem Text behalten ihn unverändert.

### Bot (`apps/bot`)

- `lib/strings.ts` wird zu `lib/strings/` mit `ar.ts` (Referenz), `en.ts`,
  `de.ts`, `tr.ts`, `fr.ts`, `ru.ts` — identische Keys, typgeprüft gegen das
  arabische Original (`satisfies Record<keyof typeof ar, string>`).
- Helper `t(lang)` liefert das Wörterbuch; `fmt` bleibt.
- Lokalisiert werden: alle bisherigen `S.*`-Texte, die Moderations-Hinweise
  und Mod-Log-Zeilen (`text-mod.ts`, `voice-mod.ts`), der Wochenbericht,
  die Willkommens-Diagnostik und die Standard-Willkommens-/Abschiedstexte.
- Handler holen die Sprache aus `getCachedGuildConfig(...)` (3 s TTL —
  Sprachwechsel greift praktisch sofort).

### Web (`apps/web`)

- Vier neue Locale-Dateien `de/tr/fr/ru.json` mit exakt den Keys von
  `ar.json`; `Lang`-Union und `dicts` erweitert; `dir=rtl` nur bei `ar`.
- Header-Sprachumschalter wird ein Dropdown mit nativen Namen
  (العربية · English · Deutsch · Türkçe · Français · Русский), auf Landing
  und im App-Header.
- Server-Einstellungen: neues Select „Bot-Sprache" → PATCH
  `config.language`; API `ConfigPatch` um `language: z.enum(LANGUAGES)`
  erweitert.

### Bot-Command

- `/settings` erhält die Option, die Bot-Sprache zu setzen (gleiche
  Enum-Werte wie das Dashboard).

## Tests

- Schema: enum akzeptiert alle sechs, Default `ar`, unbekannte Sprache wird
  abgelehnt; Welcome-Default `''`.
- Vollständigkeit: jede Bot-Strings-Datei und jede Web-Locale hat exakt die
  Keys der arabischen Referenz (automatischer Test, kein manuelles Diffen).
- text-mod: Lösch-Hinweis kommt in der Guild-Sprache.
- Welcome: leere Message rendert den lokalisierten Default.
- SettingsTab: Sprach-Select speichert via PATCH; API validiert die Enum.
