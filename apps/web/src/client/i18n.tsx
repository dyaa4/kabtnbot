import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import ar from './locales/ar.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import tr from './locales/tr.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import ru from './locales/ru.json' with { type: 'json' };

export const UI_LANGS = ['ar', 'en', 'de', 'tr', 'fr', 'ru'] as const;
export type Lang = (typeof UI_LANGS)[number];

// Native names for the language picker — identical in every UI language.
export const LANG_NAMES: Record<Lang, string> = {
  ar: 'العربية', en: 'English', de: 'Deutsch', tr: 'Türkçe', fr: 'Français', ru: 'Русский',
};

const dicts: Record<Lang, Record<string, string>> = { ar, en, de, tr, fr, ru };

function isLang(v: string | null): v is Lang {
  return UI_LANGS.includes(v as Lang);
}

interface I18n {
  lang: Lang;
  setLang(l: Lang): void;
  t(key: string): string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem('gb_lang');
    return isLang(stored) ? stored : 'ar';
  });

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('gb_lang', lang);
  }, [lang]);

  const t = (key: string): string => dicts[lang][key] ?? dicts.ar[key] ?? key;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
