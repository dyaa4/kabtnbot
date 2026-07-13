import { useQuery } from '@tanstack/react-query';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.js';

interface Option {
  id: string;
  name: string;
}

export function useRoles(guildId: string) {
  return useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => api<Option[]>(`/api/guilds/${guildId}/roles`),
  });
}

export function useTextChannels(guildId: string) {
  return useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => api<Option[]>(`/api/guilds/${guildId}/channels`),
  });
}

export function useVoiceChannels(guildId: string) {
  return useQuery({
    queryKey: ['voice-channels', guildId],
    queryFn: () => api<Option[]>(`/api/guilds/${guildId}/voice-channels`),
  });
}

const FIELD_CLASS =
  'nodrag w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm focus:border-blue-400/50 focus:outline-none';

/** Generic multi-select: a dropdown that ADDS an id + removable chips below. */
export function MultiSelect({
  options,
  values,
  onChange,
  prefix,
  placeholder,
}: {
  options: Option[];
  values: string[];
  onChange: (ids: string[]) => void;
  prefix: string;
  placeholder: string;
}) {
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? id;
  return (
    <div>
      <select
        className={FIELD_CLASS}
        value=""
        onChange={(e) => {
          if (e.target.value && !values.includes(e.target.value)) onChange([...values, e.target.value]);
        }}
      >
        <option value="">{placeholder}</option>
        {options
          .filter((o) => !values.includes(o.id))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {prefix}
              {o.name}
            </option>
          ))}
      </select>
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {values.map((id) => (
            <button
              key={id}
              type="button"
              className="nodrag rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300 hover:border-blue-400/60 hover:text-blue-100"
              onClick={() => onChange(values.filter((v) => v !== id))}
              title="×"
            >
              {prefix}
              {nameOf(id)} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select over text + voice channels (voice triggers fire in voice channels). */
export function MultiChannelSelect({
  guildId,
  values,
  onChange,
}: {
  guildId: string;
  values: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const text = useTextChannels(guildId);
  const voice = useVoiceChannels(guildId);
  const options = [...(text.data ?? []), ...(voice.data ?? [])];
  return (
    <MultiSelect
      options={options}
      values={values}
      onChange={onChange}
      prefix="#"
      placeholder={t('commands.condition.channels')}
    />
  );
}
