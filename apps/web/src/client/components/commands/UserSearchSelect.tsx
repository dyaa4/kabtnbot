import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.js';

interface Member {
  id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

// Names of picked users, remembered across searches so chips stay readable
// even after the search results that produced them are gone. Ids whose name
// was never seen (saved long ago) fall back to the raw id.
const nameCache = new Map<string, string>();

/** Debounced member search (min 2 chars) with removable chips for picked users. */
export function UserSearchSelect({
  guildId,
  values,
  onChange,
}: {
  guildId: string;
  values: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const results = useQuery({
    queryKey: ['member-search', guildId, query],
    queryFn: () => api<Member[]>(`/api/guilds/${guildId}/members?query=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });

  const pick = (m: Member) => {
    nameCache.set(m.id, m.display_name);
    if (!values.includes(m.id)) onChange([...values, m.id]);
    setInput('');
    setQuery('');
  };

  return (
    <div>
      <input
        className="nodrag w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm focus:border-cyan-400/50 focus:outline-none"
        placeholder={t('commands.users.search')}
        value={input}
        onChange={(e) => {
          const v = e.target.value;
          setInput(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setQuery(v.trim()), 300);
        }}
      />
      {query.length >= 2 && (results.data?.length ?? 0) > 0 && (
        <div className="nodrag mt-1 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-slate-900/95">
          {results.data!.map((m) => (
            <button
              key={m.id}
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-start text-sm hover:bg-white/10"
              onClick={() => pick(m)}
            >
              {m.avatar ? (
                <img
                  src={`https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=32`}
                  alt=""
                  className="h-5 w-5 rounded-full"
                />
              ) : (
                <span className="h-5 w-5 rounded-full bg-white/10" />
              )}
              <span>{m.display_name}</span>
              <span className="text-xs text-slate-500">@{m.username}</span>
            </button>
          ))}
        </div>
      )}
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {values.map((id) => (
            <button
              key={id}
              type="button"
              className="nodrag rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300 hover:border-rose-400/50 hover:text-rose-300"
              onClick={() => onChange(values.filter((v) => v !== id))}
            >
              @{nameCache.get(id) ?? id} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
