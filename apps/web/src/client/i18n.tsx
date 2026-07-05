import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import ar from './locales/ar.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

type Lang = 'ar' | 'en';
const dicts: Record<Lang, Record<string, string>> = { ar, en };

interface I18n {
  lang: Lang;
  setLang(l: Lang): void;
  t(key: string): string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('gb_lang') === 'en' ? 'en' : 'ar'));

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('gb_lang', lang);
  }, [lang]);

  const t = (key: string): string => dicts[lang][key] ?? key;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
