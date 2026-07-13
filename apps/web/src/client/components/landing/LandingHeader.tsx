import { useI18n } from '../../i18n.js';
import { LangSwitcher } from '../LangSwitcher.js';
import { DiscordIcon } from './icons.js';

const NAV = [
  { href: '#features', key: 'landing.nav.features' },
  { href: '#how', key: 'landing.nav.how' },
  { href: '#pricing', key: 'landing.nav.pricing' },
  { href: '#faq', key: 'landing.nav.faq' },
] as const;

export function LandingHeader() {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <a href="#" className="text-xl font-black">
          <span className="bg-gradient-to-r from-blue-400 via-blue-400 to-blue-400 bg-clip-text text-transparent">
            {t('brand.name')}
          </span>
          <span className="ms-1 text-slate-400">{t('brand.suffix')}</span>
        </a>

        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition hover:text-blue-300">
              {t(item.key)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LangSwitcher />
          <a
            href="/auth/discord"
            className="hidden items-center gap-2 rounded-xl bg-[#5865F2] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#4752C4] sm:flex"
          >
            <DiscordIcon className="h-4 w-4 shrink-0 fill-current" />
            {t('landing.cta.login')}
          </a>
        </div>
      </div>
    </header>
  );
}
