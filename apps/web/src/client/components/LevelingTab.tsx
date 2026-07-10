import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { ChannelSelect } from './ChannelSelect.js';
import { RoleSelect } from './RoleSelect.js';
import { SaveBar } from './SaveBar.js';
import { FormSkeleton } from './Skeleton.js';
import { useToast } from './Toast.js';

interface LevelRole {
  level: number;
  role_id: string;
}
interface GuildConfigResp {
  leveling: {
    enabled: boolean;
    announce_channel_id: string | null;
    xp_per_message: number;
    cooldown_seconds: number;
    level_roles: LevelRole[];
  };
}

const FIELD = 'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none';

export function LevelingTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const cfg = useQuery({ queryKey: ['config', guildId], queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`) });

  const [enabled, setEnabled] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [xpPerMessage, setXpPerMessage] = useState(15);
  const [cooldown, setCooldown] = useState(60);
  const [roles, setRoles] = useState<LevelRole[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (cfg.data) {
      const l = cfg.data.leveling;
      setEnabled(l.enabled);
      setAnnounce(l.announce_channel_id ?? '');
      setXpPerMessage(l.xp_per_message);
      setCooldown(l.cooldown_seconds);
      setRoles(l.level_roles);
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
  const updateRole = (i: number, p: Partial<LevelRole>) => {
    setRoles((r) => r.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
    mark();
  };

  const onSave = () => {
    const clean = roles
      .filter((r) => r.role_id && r.level >= 1)
      .map((r) => ({ level: Math.min(1000, Math.max(1, Math.round(r.level))), role_id: r.role_id }));
    patch.mutate({
      leveling: {
        enabled,
        announce_channel_id: announce || null,
        xp_per_message: xpPerMessage,
        cooldown_seconds: cooldown,
        level_roles: clean,
      },
    });
  };

  return (
    <form className="grid gap-8" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h3 className="mb-4 text-lg font-semibold">{t('leveling.title')}</h3>

        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); mark(); }} />
          <span>{t('leveling.enabled')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('leveling.enabled.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('leveling.announceChannel')}</span>
          <ChannelSelect guildId={guildId} value={announce} onChange={(id) => { setAnnounce(id); mark(); }} />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('leveling.announceChannel.hint')}</p>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">{t('leveling.xpPerMessage')}</span>
            <input
              type="number"
              min={1}
              max={100}
              className={FIELD}
              value={xpPerMessage}
              onChange={(e) => { setXpPerMessage(Number(e.target.value)); mark(); }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">{t('leveling.cooldown')}</span>
            <input
              type="number"
              min={0}
              max={3600}
              className={FIELD}
              value={cooldown}
              onChange={(e) => { setCooldown(Number(e.target.value)); mark(); }}
            />
          </label>
        </div>

        <span className="mb-2 block text-sm text-slate-400">{t('leveling.levelRoles')}</span>
        <div className="grid gap-3">
          {roles.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 sm:grid-cols-[6rem_1fr_auto] sm:items-center">
              <input
                type="number"
                min={1}
                max={1000}
                className={FIELD}
                placeholder={t('leveling.level')}
                value={r.level}
                onChange={(e) => updateRole(i, { level: Number(e.target.value) })}
              />
              <RoleSelect guildId={guildId} value={r.role_id} onChange={(id) => updateRole(i, { role_id: id })} />
              <button
                type="button"
                onClick={() => { setRoles((rs) => rs.filter((_, idx) => idx !== i)); mark(); }}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-400 transition hover:border-red-400/50 hover:text-red-300"
                aria-label={t('leveling.remove')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {roles.length < 100 && (
          <button
            type="button"
            onClick={() => { setRoles((r) => [...r, { level: 1, role_id: '' }]); mark(); }}
            className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-300"
          >
            + {t('leveling.addRole')}
          </button>
        )}
        <p className="mt-4 text-xs text-slate-500">{t('leveling.levelRoles.hint')}</p>
      </section>

      <SaveBar dirty={dirty} saving={patch.isPending} />
    </form>
  );
}
