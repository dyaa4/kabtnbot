import { useI18n, UI_LANGS, LANG_NAMES, type Lang } from '../i18n.js';

/** Language dropdown with native names, shared by all headers. */
export function LangSwitcher() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label={t('lang.switch')}
        // appearance-none drops the browser's default arrow; the custom chevron
        // below sits tight to the edge (logical `end` keeps it correct in RTL).
        className="appearance-none rounded-xl border border-white/10 bg-white/5 py-1.5 pe-8 ps-3 text-sm text-slate-200 backdrop-blur transition hover:border-cyan-400/40 hover:bg-white/10 focus:border-cyan-400/50 focus:outline-none [&>option]:bg-slate-900"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
      >
        {UI_LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}
