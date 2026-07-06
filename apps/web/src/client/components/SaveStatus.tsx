import { ApiError } from '../api.js';
import { useI18n } from '../i18n.js';

/**
 * Shared save feedback for the settings forms: green "saved" flash on success,
 * red banner when the last save failed (with the server detail when known).
 */
export function SaveStatus({ saved, error }: { saved: boolean; error: unknown }) {
  const { t } = useI18n();
  if (saved) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/30 px-4 py-2 text-emerald-300 backdrop-blur-md">
        {t('settings.saved')}
      </div>
    );
  }
  if (error) {
    const detail = error instanceof ApiError && error.message ? ` (${error.message})` : '';
    return (
      <div
        data-testid="save-error"
        className="rounded-xl border border-red-500/30 bg-red-900/30 px-4 py-2 text-red-300 backdrop-blur-md"
      >
        {t('error.generic')}
        {detail}
      </div>
    );
  }
  return null;
}
