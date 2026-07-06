import { useI18n } from '../i18n.js';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalContent {
  title: string;
  updated: string;
  sections: LegalSection[];
}

/** Long-form legal text lives here (not in the locale JSONs) — one content
 *  object per language, picked by the active UI language. */
export function LegalPage({ content }: { content: Record<'ar' | 'en', LegalContent> }) {
  const { lang, setLang } = useI18n();
  // Long-form legal text exists only in Arabic and English — other UI languages read the English version.
  const c = content[lang === 'ar' ? 'ar' : 'en'];

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <a href="/" className="text-sm text-cyan-300 hover:underline">
            {lang === 'ar' ? '← الصفحة الرئيسية' : '← Home'}
          </a>
          <button
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm backdrop-blur transition hover:border-cyan-400/40 hover:bg-white/10"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          >
            {lang === 'ar' ? 'English' : 'عربي'}
          </button>
        </div>

        <h1 className="mb-2 text-3xl font-extrabold">{c.title}</h1>
        <p className="mb-10 text-sm text-slate-500">{c.updated}</p>

        {c.sections.map((s) => (
          <section key={s.heading} className="mb-8">
            <h2 className="mb-3 text-xl font-bold text-indigo-300">{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mb-3 leading-7 text-slate-300">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
