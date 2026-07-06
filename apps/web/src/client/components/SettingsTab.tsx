import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DIALECTS } from '@gamebot/shared';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import { BotProfileCard } from './BotProfileCard.js';
import { RoleSelect } from './RoleSelect.js';
import { SaveStatus } from './SaveStatus.js';

const VoiceForm = z.object({
  enabled: z.boolean(),
  wake_word: z.string().min(2).max(30),
  dialect: z.enum(DIALECTS),
  personality_enabled: z.boolean(),
});

type VoiceValues = z.infer<typeof VoiceForm>;

interface GuildConfigResp {
  admin_role_id: string | null;
  voice: {
    enabled: boolean;
    wake_word: string;
    dialect: (typeof DIALECTS)[number];
    allowed_channel_ids: string[];
    personality_enabled: boolean;
  };
}

export function SettingsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const cfg = useQuery({ queryKey: ['config', guildId], queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`) });

  const patch = useMutation({
    mutationFn: (body: object) => api(`/api/guilds/${guildId}/config`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      void qc.invalidateQueries({ queryKey: ['config', guildId] });
    },
  });

  const voice = useForm<VoiceValues>({ resolver: zodResolver(VoiceForm) });
  const [adminRoleId, setAdminRoleId] = useState('');
  const [allowedVoiceIds, setAllowedVoiceIds] = useState<string[]>([]);

  const voiceChannels = useQuery({
    queryKey: ['voice-channels', guildId],
    queryFn: () => api<{ id: string; name: string }[]>(`/api/guilds/${guildId}/voice-channels`),
  });

  useEffect(() => {
    if (cfg.data) {
      voice.reset(cfg.data.voice);
      setAdminRoleId(cfg.data.admin_role_id ?? '');
      setAllowedVoiceIds(cfg.data.voice.allowed_channel_ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  const toggleVoiceChannel = (id: string) => {
    setAllowedVoiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (cfg.isLoading) return <p className="text-slate-400">{t('loading')}</p>;

  const voiceError = Object.values(voice.formState.errors)[0]?.message as string | undefined;

  return (
    <div className="grid gap-8">
      <SaveStatus saved={saved} error={patch.error} />

      <form
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        onSubmit={voice.handleSubmit((v) => patch.mutate({ voice: { ...v, allowed_channel_ids: allowedVoiceIds } }))}
      >
        <h3 className="mb-4 text-lg font-semibold">{t('settings.voice')}</h3>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...voice.register('enabled')} />
          <span>{t('settings.voice.enabled')}</span>
        </label>
        <p className="mb-3 ms-6 text-xs text-slate-500">{t('settings.voice.enabled.hint')}</p>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.wakeWord')}</span>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            {...voice.register('wake_word')}
          />
        </label>
        <p className="mb-3 text-xs text-slate-500">{t('settings.voice.wakeWord.hint')}</p>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.dialect')}</span>
          <select
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            {...voice.register('dialect')}
          >
            {DIALECTS.map((d) => (
              <option key={d} value={d}>
                {t(`settings.dialect.${d}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('settings.voice.dialect.hint')}</p>
        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" {...voice.register('personality_enabled')} />
          <span>{t('settings.personality')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('settings.personality.hint')}</p>

        <span className="mb-1 block text-sm text-slate-400">{t('settings.voice.allowedChannels')}</span>
        <div className="mb-1 grid gap-1 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          {voiceChannels.data?.length === 0 && <span className="text-xs text-slate-500">{t('settings.voice.noVoiceChannels')}</span>}
          {voiceChannels.data?.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowedVoiceIds.includes(c.id)}
                onChange={() => toggleVoiceChannel(c.id)}
              />
              <span>🔊 {c.name}</span>
            </label>
          ))}
        </div>
        <p className="mb-4 text-xs text-slate-500">{t('settings.voice.allowedChannels.hint')}</p>
        <p data-testid="voice-error" className="mb-2 text-sm text-red-400">
          {voiceError ?? ''}
        </p>
        <button
          className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-4 py-2 font-semibold text-slate-950 shadow-[0_0_20px_-6px_rgba(99,102,241,0.7)] transition hover:scale-[1.02] hover:shadow-[0_0_26px_-4px_rgba(34,211,238,0.8)]"
          type="submit"
        >
          {t('settings.save')}
        </button>
      </form>

      <form
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        onSubmit={(e) => {
          e.preventDefault();
          patch.mutate({ admin_role_id: adminRoleId === '' ? null : adminRoleId });
        }}
      >
        <h3 className="mb-4 text-lg font-semibold">{t('settings.adminRole')}</h3>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('settings.adminRole')}</span>
          <RoleSelect guildId={guildId} value={adminRoleId} onChange={setAdminRoleId} />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('settings.adminRole.hint')}</p>
        <button
          className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-4 py-2 font-semibold text-slate-950 shadow-[0_0_20px_-6px_rgba(99,102,241,0.7)] transition hover:scale-[1.02] hover:shadow-[0_0_26px_-4px_rgba(34,211,238,0.8)]"
          type="submit"
        >
          {t('settings.save')}
        </button>
      </form>

      <BotProfileCard guildId={guildId} />
    </div>
  );
}
