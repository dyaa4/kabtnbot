import { useI18n } from '../../i18n.js';

export function CtaBand({ inviteUrl }: { inviteUrl: string }) {
  const { t } = useI18n();

  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-950/80 via-slate-950 to-blue-950/60 px-8 py-14 text-center backdrop-blur-md">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl"
          aria-hidden="true"
        />
        <h2 className="relative mb-3 text-3xl font-extrabold md:text-4xl">{t('landing.ctaBand.title')}</h2>
        <p className="relative mb-8 text-slate-400">{t('landing.ctaBand.body')}</p>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noreferrer"
          className="relative inline-block rounded-xl bg-gradient-to-r from-blue-500 via-blue-500 to-blue-400 px-8 py-4 text-lg font-bold text-slate-950 shadow-[0_0_36px_-6px_rgba(59,130,246,0.8)] transition hover:scale-105"
        >
          {t('landing.cta.invite')}
        </a>
      </div>
    </section>
  );
}
