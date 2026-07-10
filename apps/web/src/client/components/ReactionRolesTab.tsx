import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { RoleSelect } from './RoleSelect.js';
import { SaveBar } from './SaveBar.js';
import { FormSkeleton } from './Skeleton.js';
import { useToast } from './Toast.js';

interface RRButton {
  label: string;
  emoji: string | null;
  role_id: string;
}
interface GuildConfigResp {
  reaction_roles: { enabled: boolean; title: string; buttons: RRButton[] };
}

const FIELD = 'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none';

export function ReactionRolesTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const cfg = useQuery({ queryKey: ['config', guildId], queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`) });

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('');
  const [buttons, setButtons] = useState<RRButton[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (cfg.data) {
      setEnabled(cfg.data.reaction_roles.enabled);
      setTitle(cfg.data.reaction_roles.title);
      setButtons(cfg.data.reaction_roles.buttons);
      setDirty(false);
    }
  }, [cfg.data]);

  const patch = useMutation({
    mutationFn: (body: object) => api(`/api/guilds/${guildId}/config`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(t('settings.saved'));
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['config', guildId] });
    },
    onError: (err) => {
      const detail = err instanceof ApiError && err.message ? ` (${err.message})` : '';
      toast.error(`${t('error.generic')}${detail}`);
    },
  });

  if (cfg.isLoading) return <FormSkeleton sections={1} />;

  const mark = () => setDirty(true);
  const updateBtn = (i: number, p: Partial<RRButton>) => {
    setButtons((b) => b.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
    mark();
  };
  const addBtn = () => {
    setButtons((b) => [...b, { label: '', emoji: null, role_id: '' }]);
    mark();
  };
  const removeBtn = (i: number) => {
    setButtons((b) => b.filter((_, idx) => idx !== i));
    mark();
  };

  const onSave = () => {
    const clean = buttons
      .filter((b) => b.label.trim() && b.role_id)
      .map((b) => ({ label: b.label.trim().slice(0, 80), emoji: b.emoji?.trim() || null, role_id: b.role_id }));
    patch.mutate({ reaction_roles: { enabled, title: title.trim(), buttons: clean } });
  };

  return (
    <form className="grid gap-8" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('reactionRoles.title')}</h3>

        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); mark(); }} />
          <span>{t('reactionRoles.enabled')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('reactionRoles.enabled.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('reactionRoles.panelTitle')}</span>
          <input className={FIELD} value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); mark(); }} />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('reactionRoles.panelTitle.hint')}</p>

        <span className="mb-2 block text-sm text-slate-400">{t('reactionRoles.buttons')}</span>
        <div className="grid gap-3">
          {buttons.map((b, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 sm:grid-cols-[1fr_5rem_1fr_auto] sm:items-center">
              <input
                className={FIELD}
                placeholder={t('reactionRoles.label')}
                value={b.label}
                maxLength={80}
                onChange={(e) => updateBtn(i, { label: e.target.value })}
              />
              <input
                className={FIELD}
                placeholder={t('reactionRoles.emoji')}
                value={b.emoji ?? ''}
                maxLength={64}
                onChange={(e) => updateBtn(i, { emoji: e.target.value || null })}
              />
              <RoleSelect guildId={guildId} value={b.role_id} onChange={(id) => updateBtn(i, { role_id: id })} />
              <button
                type="button"
                onClick={() => removeBtn(i)}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-400 transition hover:border-red-400/50 hover:text-red-300"
                aria-label={t('reactionRoles.remove')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {buttons.length < 25 && (
          <button
            type="button"
            onClick={addBtn}
            className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-300"
          >
            + {t('reactionRoles.addButton')}
          </button>
        )}
        <p className="mt-4 text-xs text-slate-500">{t('reactionRoles.postHint')}</p>
      </section>

      <SaveBar dirty={dirty} saving={patch.isPending} />
    </form>
  );
}
