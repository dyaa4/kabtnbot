import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface Channel {
  id: string;
  name: string;
}

const FIELD_CLASS =
  'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none';

/** A dropdown of the guild's text channels (by name) for picking a channel id. */
export function ChannelSelect({
  guildId,
  value,
  onChange,
}: {
  guildId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const channels = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => api<Channel[]>(`/api/guilds/${guildId}/channels`),
  });

  return (
    <select className={FIELD_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('channel.none')}</option>
      {channels.data?.map((c) => (
        <option key={c.id} value={c.id}>
          #{c.name}
        </option>
      ))}
      {/* keep a saved id selectable even if it isn't in the fetched list */}
      {value && !channels.data?.some((c) => c.id === value) && <option value={value}>{value}</option>}
    </select>
  );
}
