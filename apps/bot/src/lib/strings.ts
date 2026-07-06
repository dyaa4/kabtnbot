import type { Language } from '@gamebot/shared';
import { ar } from './strings/ar.js';
import { en } from './strings/en.js';
import { de } from './strings/de.js';
import { tr } from './strings/tr.js';
import { fr } from './strings/fr.js';
import { ru } from './strings/ru.js';

export type BotStrings = Record<keyof typeof ar, string>;

export const DICTS: Record<Language, BotStrings> = { ar, en, de, tr, fr, ru };

/** Per-guild bot strings; pass `config.language`. */
export function t(lang: Language): BotStrings {
  return DICTS[lang] ?? ar;
}

/**
 * Arabic fallback for contexts without a guild config (DMs, guild-less
 * interactions). Guild-scoped code should use t(config.language) instead.
 */
export const S = ar;

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
