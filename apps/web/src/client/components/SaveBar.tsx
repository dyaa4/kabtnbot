import { useI18n } from '../i18n.js';

/**
 * Always-visible sticky save bar — the single submit button of the form it
 * lives in. With `dirty` provided it shows an unsaved-changes hint and keeps
 * the button disabled while there is nothing to save.
 */
export function SaveBar({ dirty, saving = false }: { dirty?: boolean; saving?: boolean }) {
  const { t } = useI18n();
  const gated = dirty !== undefined;
  return (
    <div className="sticky bottom-4 z-30 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <span className={`text-sm ${gated && dirty ? 'font-semibold text-amber-300' : 'text-slate-500'}`}>
        {gated ? (dirty ? t('settings.unsaved') : t('settings.allSaved')) : ''}
      </span>
      <button
        type="submit"
        disabled={saving || (gated && !dirty)}
        className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-6 py-2.5 font-semibold text-slate-950 shadow-[0_0_20px_-6px_rgba(99,102,241,0.7)] transition hover:scale-[1.02] hover:shadow-[0_0_26px_-4px_rgba(34,211,238,0.8)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        {t('settings.save')}
      </button>
    </div>
  );
}
