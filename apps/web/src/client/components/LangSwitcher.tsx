import { useI18n, UI_LANGS, LANG_NAMES, type Lang } from '../i18n.js';

/** Language dropdown with native names, shared by all headers. */
export function LangSwitcher() {
  const { t, lang, setLang } = useI18n();
  return (
    <select
      aria-label={t('lang.switch')}
      className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-200 backdrop-blur transition hover:border-cyan-400/40 hover:bg-white/10 focus:border-cyan-400/50 focus:outline-none [&>option]:bg-slate-900"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
    >
      {UI_LANGS.map((l) => (
        <option key={l} value={l}>
          {LANG_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
