import type { ReactNode } from 'react';
import { MessageSquare, ScrollText, Workflow } from 'lucide-react';
import { useI18n } from '../../i18n.js';
import { SectionHeading } from './SectionHeading.js';
import { ChartIcon, IdBadgeIcon, ImageIcon, MicIcon, ShieldIcon } from './icons.js';

// Native names of the six supported bot languages, shown as pills.
const LANGS = ['العربية', 'English', 'Deutsch', 'Türkçe', 'Français', 'Русский'] as const;

function TierBadge({ tier }: { tier: 'free' | 'pro' }) {
  const { t } = useI18n();
  return tier === 'pro' ? (
    <span className="rounded-full bg-blue-400/15 px-2.5 py-0.5 text-xs font-semibold text-blue-300 ring-1 ring-blue-400/40">
      💎 {t('landing.tier.pro')}
    </span>
  ) : (
    <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
      {t('landing.tier.free')}
    </span>
  );
}

function Card({ icon, title, body, tier, children, className = '' }: {
  icon: ReactNode;
  title: string;
  body: string;
  tier: 'free' | 'pro';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition hover:-translate-y-1 hover:border-blue-400/40 hover:shadow-[0_0_30px_-8px_rgba(59,130,246,0.5)] ${className}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="inline-flex rounded-xl border border-blue-400/20 bg-blue-400/10 p-2.5 text-blue-300 transition group-hover:border-blue-400/40">
          {icon}
        </div>
        <TierBadge tier={tier} />
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
          tier="pro"
          className="md:col-span-2"
        >
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gradient-to-r from-blue-500/30 to-blue-400/30 px-4 py-1.5 text-sm font-bold text-blue-200 ring-1 ring-blue-400/40">
              «{t('landing.feature.voice.wake')}»
            </span>
            {LANGS.map((name) => (
              <span
                key={name}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300"
              >
                {name}
              </span>
            ))}
          </div>
        </Card>

        <Card
          icon={<ShieldIcon className="h-6 w-6" />}
          title={t('landing.feature.protection.title')}
          body={t('landing.feature.protection.body')}
          tier="free"
        />
        <Card
          icon={<ChartIcon className="h-6 w-6" />}
          title={t('landing.feature.activity.title')}
          body={t('landing.feature.activity.body')}
          tier="free"
        />
        <Card
          icon={<ImageIcon className="h-6 w-6" />}
          title={t('landing.feature.welcome.title')}
          body={t('landing.feature.welcome.body')}
          tier="free"
        />
        <Card
          icon={<IdBadgeIcon className="h-6 w-6" />}
          title={t('landing.feature.botProfile.title')}
          body={t('landing.feature.botProfile.body')}
          tier="pro"
        />
        <Card
          icon={<Workflow className="h-6 w-6" />}
          title={t('landing.feature.automation.title')}
          body={t('landing.feature.automation.body')}
          tier="pro"
        />
        <Card
          icon={<MessageSquare className="h-6 w-6" />}
          title={t('landing.feature.aichat.title')}
          body={t('landing.feature.aichat.body')}
          tier="pro"
        />
        <Card
          icon={<ScrollText className="h-6 w-6" />}
          title={t('landing.feature.logs.title')}
          body={t('landing.feature.logs.body')}
          tier="pro"
        />
      </div>
    </section>
  );
}
