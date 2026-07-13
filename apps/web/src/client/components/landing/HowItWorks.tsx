import { useI18n } from '../../i18n.js';
import { SectionHeading } from './SectionHeading.js';

const STEPS = ['step1', 'step2', 'step3'] as const;

export function HowItWorks({ inviteUrl }: { inviteUrl: string }) {
  const { t } = useI18n();

  return (
    <section id="how" className="relative scroll-mt-20 py-20">
      {/* subtle band background so the section reads as its own chapter */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/40 to-transparent" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow={t('landing.nav.how')} title={t('landing.how.title')} />

        <ol className="relative grid gap-10 sm:grid-cols-3 sm:gap-6">
          {/* connecting line behind the number badges (desktop only) */}
          <div
            className="pointer-events-none absolute inset-x-[16%] top-6 hidden h-px bg-gradient-to-r from-blue-500/50 via-blue-400/50 to-blue-500/50 sm:block"
            aria-hidden="true"
          />
          {STEPS.map((step, i) => (
            <li key={step} className="relative text-center">
              <span className="relative z-10 mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-400 text-lg font-black text-slate-950 shadow-[0_0_24px_-6px_rgba(59,130,246,0.8)]">
                {i + 1}
              </span>
              <h3 className="mb-2 text-lg font-bold text-slate-100">{t(`landing.how.${step}.title`)}</h3>
              <p className="mx-auto max-w-xs text-sm leading-6 text-slate-400">{t(`landing.how.${step}.body`)}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 text-center">
          <a
            href={inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-xl bg-gradient-to-r from-blue-500 via-blue-500 to-blue-400 px-7 py-3 font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(59,130,246,0.7)] transition hover:scale-105 hover:shadow-[0_0_40px_-4px_rgba(59,130,246,0.8)]"
          >
            {t('landing.cta.invite')}
          </a>
        </div>
      </div>
    </section>
  );
}
