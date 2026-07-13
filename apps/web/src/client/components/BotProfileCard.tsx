import { Bot } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { CardSkeleton } from './Skeleton.js';

interface BotProfileResp {
  nickname: string | null;
  username: string;
  avatar_url: string | null;
}

export function BotProfileCard({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [appliedGlobally, setAppliedGlobally] = useState(false);
  const [nickname, setNickname] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // No focus-refetch: the nickname field resets from profile.data, so a
  // refetch while the admin is mid-edit would silently wipe their input.
  const profile = useQuery({
    queryKey: ['bot-profile', guildId],
    queryFn: () => api<BotProfileResp>(`/api/guilds/${guildId}/bot-profile`),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (profile.data) setNickname(profile.data.nickname ?? '');
  }, [profile.data]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const saveNick = useMutation({
    mutationFn: (nick: string) =>
      api(`/api/guilds/${guildId}/bot-profile`, { method: 'PATCH', body: JSON.stringify({ nickname: nick }) }),
    onSuccess: () => {
      flashSaved();
      void qc.invalidateQueries({ queryKey: ['bot-profile', guildId] });
    },
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch(`/api/guilds/${guildId}/bot-profile/avatar`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) throw new Error(`avatar ${res.status}`);
      return (await res.json()) as { scope: 'guild' | 'global' };
    },
    onSuccess: (r) => {
      setAppliedGlobally(r.scope === 'global');
      flashSaved();
      void qc.invalidateQueries({ queryKey: ['bot-profile', guildId] });
    },
  });

  if (profile.isLoading) return <CardSkeleton />;

  const nickError =
    saveNick.error instanceof ApiError && saveNick.error.code === 'MISSING_PERMISSIONS'
      ? t('botProfile.noPermission')
      : saveNick.isError
        ? t('error.generic')
        : null;

  return (
    <form
      className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
      onSubmit={(e) => {
        e.preventDefault();
        saveNick.mutate(nickname);
      }}
    >
      <h3 className="mb-4 text-lg font-semibold">{t('botProfile.title')}</h3>

      {saved && (
        <div className="mb-3 rounded-xl border border-blue-500/30 bg-blue-900/30 px-4 py-2 text-blue-300">
          {t('settings.saved')}
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        {profile.data?.avatar_url ? (
          <img
            src={profile.data.avatar_url}
            alt={t('botProfile.avatar')}
            className="h-16 w-16 rounded-full border border-white/15 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-slate-950/60">
            <Bot className="h-7 w-7 text-slate-400" />
          </div>
        )}
        <div>
          <span className="mb-1 block text-sm text-slate-400">{t('botProfile.avatar')}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            className="hidden"
            data-testid="bot-avatar-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAvatar.mutate(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-blue-400/50 hover:text-blue-300"
          >
            {uploadAvatar.isPending ? t('botProfile.uploading') : t('botProfile.upload')}
          </button>
          <p className="mt-1 text-xs text-slate-500">{t('botProfile.avatar.hint')}</p>
        </div>
      </div>
      {appliedGlobally && <p className="mb-3 text-sm text-blue-300">{t('botProfile.globalNote')}</p>}
      {uploadAvatar.isError && <p className="mb-3 text-sm text-red-400">{t('botProfile.uploadFailed')}</p>}

      <label className="mb-1 block">
        <span className="mb-1 block text-sm text-slate-400">{t('botProfile.name')}</span>
        <input
          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-blue-400/50 focus:outline-none"
          value={nickname}
          maxLength={32}
          placeholder={profile.data?.username ?? ''}
          onChange={(e) => setNickname(e.target.value)}
        />
      </label>
      <p className="mb-3 text-xs text-slate-500">{t('botProfile.name.hint')}</p>
      {nickError && (
        <p data-testid="bot-nick-error" className="mb-2 text-sm text-red-400">
          {nickError}
        </p>
      )}

      <button
        className="rounded-xl bg-gradient-to-r from-blue-500 via-blue-500 to-blue-400 px-4 py-2 font-semibold text-slate-950 shadow-[0_0_20px_-6px_rgba(59,130,246,0.7)] transition hover:scale-[1.02] hover:shadow-[0_0_26px_-4px_rgba(59,130,246,0.8)]"
        type="submit"
      >
        {t('settings.save')}
      </button>
    </form>
  );
}
