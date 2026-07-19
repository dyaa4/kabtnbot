import { useI18n } from '../i18n.js';
import { usePremiumStatus } from '../premium.js';
import { BotProfileCard } from './BotProfileCard.js';
import { PremiumUpsell } from './PremiumUpsell.js';
import { FormSkeleton } from './Skeleton.js';

/** Bot avatar + nickname editing — premium (server-gated on write). */
export function CustomizeTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const { loading, premium } = usePremiumStatus(guildId);

  if (loading) return <FormSkeleton sections={1} />;
  if (!premium) {
    return <PremiumUpsell title={t('customize.premium.title')} body={t('customize.premium.body')} />;
  }
  return <BotProfileCard guildId={guildId} />;
}
