import type { ReactNode } from 'react';
import { useI18n } from '../../i18n.js';
import { SectionHeading } from './SectionHeading.js';
import { ChartIcon, IdBadgeIcon, ImageIcon, MicIcon, ShieldIcon } from './icons.js';

const DIALECT_KEYS = ['gulf', 'syrian', 'egyptian', 'msa'] as const;

function Card({ icon, title, body, children, className = '' }: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition hover:-translate-y-1 hover:border-blue-400/40 hover:shadow-[0_0_30px_-8px_rgba(59,130,246,0.5)] ${className}`}
    >
      <div className="mb-4 inline-flex rounded-xl border border-blue-400/20 bg-blue-400/10 p-2.5 text-blue-300 transition group-hover:border-blue-400/40">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-100">{title}</h3>
      <p className="text-sm leading-6 text-slate-400">{body}</p>
      {children}
    </div>
  );
}

export function Features() {
  const { t } = useI18n();

  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
      <SectionHeading eyebrow={t('landing.nav.features')} title={t('landing.features.title')} />

      <div className="grid gap-5 md:grid-cols-3">
        {/* USP: the voice assistant gets the big card */}
        <Card
          icon={<MicIcon className="h-6 w-6" />}
          title={t('landing.feature.voice.title')}
          body={t('landing.feature.voice.body')}
          className="md:col-span-2"
        >
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gradient-to-r from-blue-500/30 to-blue-400/30 px-4 py-1.5 text-sm font-bold text-blue-200 ring-1 ring-blue-400/40">
              «{t('landing.feature.voice.wake')}»
            </span>
            {DIALECT_KEYS.map((key) => (
              <span
                key={key}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300"
              >
                {t(`settings.dialect.${key}`)}
              </span>
            ))}
          </div>
        </Card>

        <Card
          icon={<ShieldIcon className="h-6 w-6" />}
          title={t('landing.feature.protection.title')}
          body={t('landing.feature.protection.body')}
        />
        <Card
          icon={<ChartIcon className="h-6 w-6" />}
          title={t('landing.feature.activity.title')}
          body={t('landing.feature.activity.body')}
        />
        <Card
          icon={<ImageIcon className="h-6 w-6" />}
          title={t('landing.feature.welcome.title')}
          body={t('landing.feature.welcome.body')}
        />
        <Card
          icon={<IdBadgeIcon className="h-6 w-6" />}
          title={t('landing.feature.botProfile.title')}
          body={t('landing.feature.botProfile.body')}
        />
      </div>
    </section>
  );
}
