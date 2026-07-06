import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface Role {
  id: string;
  name: string;
}

const FIELD_CLASS =
  'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none';

/** A dropdown of the guild's assignable roles (by name) for picking a role id. */
export function RoleSelect({
  guildId,
  value,
  onChange,
}: {
  guildId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const roles = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => api<Role[]>(`/api/guilds/${guildId}/roles`),
  });

  return (
    <select className={FIELD_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('role.none')}</option>
      {roles.data?.map((r) => (
        <option key={r.id} value={r.id}>
          @{r.name}
        </option>
      ))}
      {/* keep a saved id selectable even if it isn't in the fetched list */}
      {value && !roles.data?.some((r) => r.id === value) && <option value={value}>{value}</option>}
    </select>
  );
}
