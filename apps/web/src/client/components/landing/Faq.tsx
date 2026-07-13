import { useI18n } from '../../i18n.js';
import { SectionHeading } from './SectionHeading.js';

const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;

export function Faq() {
  const { t } = useI18n();

  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-6 py-20">
      <SectionHeading eyebrow={t('landing.nav.faq')} title={t('landing.faq.title')} />

      <div className="grid gap-3">
        {QUESTIONS.map((q) => (
          <details
            key={q}
            className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md transition open:border-blue-400/30"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-semibold text-slate-100 [&::-webkit-details-marker]:hidden">
              {t(`landing.faq.${q}.q`)}
              <span
                className="shrink-0 text-blue-400 transition-transform duration-200 group-open:rotate-45"
                aria-hidden="true"
              >
                +
              </span>
            </summary>
            <p className="px-6 pb-5 text-sm leading-7 text-slate-400">{t(`landing.faq.${q}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
