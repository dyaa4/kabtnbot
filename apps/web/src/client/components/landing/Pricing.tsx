import { useI18n } from '../../i18n.js';
import { SectionHeading } from './SectionHeading.js';
import { CheckIcon } from './icons.js';

function PlanItem({ text, tone }: { text: string; tone: 'cyan' | 'amber' }) {
  const ring = tone === 'cyan' ? 'bg-cyan-400/15 text-cyan-300' : 'bg-amber-400/15 text-amber-300';
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ring}`}>
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
      <span>{text}</span>
    </li>
  );
}

export function Pricing({ inviteUrl }: { inviteUrl: string }) {
  const { t } = useI18n();

  return (
    <section id="pricing" className="mx-auto max-w-5xl scroll-mt-20 px-6 py-20">
      <SectionHeading eyebrow={t('landing.nav.pricing')} title={t('pricing.title')} />

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Free plan */}
        <div className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-md">
          <h3 className="mb-1 text-2xl font-bold text-cyan-300">{t('pricing.free.title')}</h3>
          <p className="mb-6 text-sm text-slate-400">{t('pricing.free.tagline')}</p>
          <ul className="grid gap-3 text-sm text-slate-300">
            {(['protection', 'welcome', 'botProfile'] as const).map((key) => (
              <PlanItem key={key} text={t(`pricing.free.${key}`)} tone="cyan" />
            ))}
          </ul>
          <a
            href={inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-8 block rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-2.5 text-center font-semibold text-cyan-300 transition hover:bg-cyan-400/20"
          >
            {t('landing.cta.invite')}
          </a>
        </div>

        {/* Premium plan — highlighted, coming soon */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-500/60 via-violet-500/60 to-amber-400/60 p-[1.5px] shadow-[0_0_40px_-10px_rgba(139,92,246,0.6)]">
          <div className="h-full rounded-2xl bg-slate-950/90 p-8 backdrop-blur-md">
            <div className="mb-1 flex items-center gap-3">
              <h3 className="text-2xl font-bold text-amber-300">{t('pricing.premium.title')}</h3>
              <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                {t('pricing.premium.badge')}
              </span>
            </div>
            <p className="mb-6 text-sm text-slate-400">{t('pricing.premium.tagline')}</p>
            <ul className="grid gap-3 text-sm text-slate-300">
              {(['everything', 'voice', 'stats', 'voicelog', 'limits'] as const).map((key) => (
                <PlanItem key={key} text={t(`pricing.premium.${key}`)} tone="amber" />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
