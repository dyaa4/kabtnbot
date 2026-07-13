import { useI18n } from '../../i18n.js';

export function LandingFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-white/10 px-6 py-12">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="mb-2 text-lg font-black">
            <span className="bg-gradient-to-r from-blue-400 via-blue-400 to-blue-400 bg-clip-text text-transparent">
              {t('brand.name')}
            </span>
            <span className="ms-1 text-slate-400">{t('brand.suffix')}</span>
          </p>
          <p className="max-w-xs text-sm leading-6 text-slate-500">{t('footer.tagline')}</p>
        </div>

        <nav aria-label={t('footer.product')} className="text-sm">
          <p className="mb-3 font-semibold text-slate-300">{t('footer.product')}</p>
          <ul className="grid gap-2 text-slate-500">
            <li><a href="#features" className="transition hover:text-blue-300">{t('landing.nav.features')}</a></li>
            <li><a href="#how" className="transition hover:text-blue-300">{t('landing.nav.how')}</a></li>
            <li><a href="#pricing" className="transition hover:text-blue-300">{t('landing.nav.pricing')}</a></li>
            <li><a href="#faq" className="transition hover:text-blue-300">{t('landing.nav.faq')}</a></li>
          </ul>
        </nav>

        <nav aria-label={t('footer.legal')} className="text-sm">
          <p className="mb-3 font-semibold text-slate-300">{t('footer.legal')}</p>
          <ul className="grid gap-2 text-slate-500">
            <li><a href="/terms" className="transition hover:text-blue-300">{t('footer.terms')}</a></li>
            <li><a href="/privacy" className="transition hover:text-blue-300">{t('footer.privacy')}</a></li>
          </ul>
        </nav>
      </div>

      <p className="mx-auto mt-10 max-w-6xl border-t border-white/5 pt-6 text-sm text-slate-600">
        © 2026 <span className="font-semibold text-slate-500">{t('brand.name')}</span>
      </p>
    </footer>
  );
}
