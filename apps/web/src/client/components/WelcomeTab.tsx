import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.js';
import { useI18n } from '../i18n.js';
import { ChannelSelect } from './ChannelSelect.js';
import { MessageEditor } from './MessageEditor.js';
import { RoleSelect } from './RoleSelect.js';
import { SaveBar } from './SaveBar.js';
import { FormSkeleton } from './Skeleton.js';
import { useToast } from './Toast.js';

interface GuildConfigResp {
  welcome: {
    enabled: boolean;
    channel_id: string | null;
    message: string;
    banner_url: string | null; // legacy URL banners keep working as a preview/render fallback
    auto_role_id: string | null;
    farewell_enabled: boolean;
    farewell_message: string;
    farewell_channel_id: string | null;
    avatar_x: number;
    avatar_y: number;
    avatar_size: number;
    show_name: boolean;
  };
}

interface Me {
  uid: string;
  uname: string;
  avatar: string | null;
}

function avatarUrlOf(me: Me | undefined): string {
  if (me?.avatar) return `https://cdn.discordapp.com/avatars/${me.uid}/${me.avatar}.png?size=128`;
  return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

interface Pos {
  x: number;
  y: number;
  size: number;
}

const DEFAULT_POS: Pos = { x: 0.5, y: 0.4, size: 0.25 };
// Mirrors the server-side z.string().max(2000) on welcome/farewell messages
// (2000 = Discord's per-message hard limit).
const MSG_MAX = 2000;
const SIZE_MIN = 0.05;
const SIZE_MAX = 0.6;

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function WelcomeTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  // No focus-refetch: the effect below resets the whole form from cfg.data,
  // so a refetch while the admin is mid-edit would silently wipe their edits.
  const cfg = useQuery({
    queryKey: ['config', guildId],
    queryFn: () => api<GuildConfigResp>(`/api/guilds/${guildId}/config`),
    refetchOnWindowFocus: false,
  });
  // The logged-in admin stands in for the joining member in the preview.
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), retry: false });

  // Uploaded banner bytes, exposed as an object URL for the preview; null = none uploaded.
  const banner = useQuery({
    queryKey: ['banner', guildId],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`/api/guilds/${guildId}/assets/welcome-banner`, { credentials: 'same-origin' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`banner ${res.status}`);
      return URL.createObjectURL(await res.blob());
    },
  });

  const patch = useMutation({
    mutationFn: (body: object) => api(`/api/guilds/${guildId}/config`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(t('settings.saved'));
      void qc.invalidateQueries({ queryKey: ['config', guildId] });
    },
    onError: (err) => {
      const detail = err instanceof ApiError && err.message ? ` (${err.message})` : '';
      toast.error(`${t('error.generic')}${detail}`);
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch(`/api/guilds/${guildId}/assets/welcome-banner`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) throw new Error(`upload ${res.status}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['banner', guildId] }),
  });

  const removeBanner = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/guilds/${guildId}/assets/welcome-banner`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      // Also clear a legacy banner_url: the preview (and the bot) fall back to
      // it, so deleting only the uploaded asset would bring the old URL banner
      // right back as if Remove had done nothing.
      if (cfg.data?.welcome.banner_url) {
        await api(`/api/guilds/${guildId}/config`, {
          method: 'PATCH',
          body: JSON.stringify({ welcome: { banner_url: null } }),
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['banner', guildId] });
      void qc.invalidateQueries({ queryKey: ['config', guildId] });
    },
    onError: () => toast.error(t('error.generic')),
  });

  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [autoRoleId, setAutoRoleId] = useState('');
  const [farewellEnabled, setFarewellEnabled] = useState(false);
  const [farewellMessage, setFarewellMessage] = useState('');
  const [farewellChannelId, setFarewellChannelId] = useState('');
  const [message, setMessage] = useState('');
  const [showName, setShowName] = useState(true);
  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  // Natural width/height ratio of the banner so the preview matches what the bot renders.
  const [ratio, setRatio] = useState<number | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draggingRef = useRef(false);
  const resizingRef = useRef(false);

  useEffect(() => {
    if (cfg.data) {
      const w = cfg.data.welcome;
      setEnabled(w.enabled);
      setChannelId(w.channel_id ?? '');
      setAutoRoleId(w.auto_role_id ?? '');
      setFarewellEnabled(w.farewell_enabled);
      setFarewellMessage(w.farewell_message);
      setFarewellChannelId(w.farewell_channel_id ?? '');
      setMessage(w.message);
      setShowName(w.show_name);
      setPos({ x: w.avatar_x, y: w.avatar_y, size: w.avatar_size });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  const bannerSrc = banner.data ?? cfg.data?.welcome.banner_url ?? null;
  const hasBanner = bannerSrc !== null;

  // Revoke the previous banner object URL once a new one replaces it, so
  // repeated uploads don't accumulate image blobs in memory.
  const prevBannerUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevBannerUrlRef.current;
    if (prev && prev !== banner.data) URL.revokeObjectURL(prev);
    prevBannerUrlRef.current = banner.data ?? null;
  }, [banner.data]);
  // Revoke the still-held blob URL when the tab unmounts — the effect above only
  // fires on change, so without this each mount/unmount leaks one image blob.
  useEffect(() => () => {
    if (prevBannerUrlRef.current) URL.revokeObjectURL(prevBannerUrlRef.current);
  }, []);

  // React attaches onWheel passively, so preventDefault (needed to stop the page
  // from scrolling while resizing) requires a native non-passive listener.
  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setPos((p) => ({ ...p, size: round(clamp(p.size + (e.deltaY < 0 ? 0.02 : -0.02), SIZE_MIN, SIZE_MAX)) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasBanner]);

  if (cfg.isLoading || banner.isLoading) return <FormSkeleton sections={2} />;

  const updateFromPointer = (clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = round(clamp((clientX - rect.left) / rect.width, 0, 1));
    const y = round(clamp((clientY - rect.top) / rect.height, 0, 1));
    setPos((p) => ({ ...p, x, y }));
  };

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };
  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 0.01;
    if (e.key === 'ArrowLeft') setPos((p) => ({ ...p, x: round(clamp(p.x - step, 0, 1)) }));
    else if (e.key === 'ArrowRight') setPos((p) => ({ ...p, x: round(clamp(p.x + step, 0, 1)) }));
    else if (e.key === 'ArrowUp') setPos((p) => ({ ...p, y: round(clamp(p.y - step, 0, 1)) }));
    else if (e.key === 'ArrowDown') setPos((p) => ({ ...p, y: round(clamp(p.y + step, 0, 1)) }));
    else if (e.key === '+' || e.key === '=') setPos((p) => ({ ...p, size: round(clamp(p.size + 0.02, SIZE_MIN, SIZE_MAX)) }));
    else if (e.key === '-') setPos((p) => ({ ...p, size: round(clamp(p.size - 0.02, SIZE_MIN, SIZE_MAX)) }));
    else return;
    e.preventDefault();
  };

  const resizeFromPointer = (clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const cx = rect.left + pos.x * rect.width;
    const cy = rect.top + pos.y * rect.height;
    // The grip sits on the corner of the circle's bounding square → radius = dist / √2.
    const dist = Math.hypot(clientX - cx, clientY - cy);
    const size = round(clamp((2 * dist) / Math.SQRT2 / rect.width, SIZE_MIN, SIZE_MAX));
    setPos((p) => ({ ...p, size }));
  };

  const onGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    resizingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGripPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current) return;
    e.stopPropagation();
    resizeFromPointer(e.clientX, e.clientY);
  };
  const onGripPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    resizingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onFilePicked = (file: File | null | undefined) => {
    if (file) upload.mutate(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onFilePicked(e.dataTransfer.files?.[0]);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedChannel = channelId.trim();
    patch.mutate({
      welcome: {
        enabled,
        channel_id: trimmedChannel === '' ? null : trimmedChannel,
        auto_role_id: autoRoleId === '' ? null : autoRoleId,
        farewell_enabled: farewellEnabled,
        farewell_message: farewellMessage,
        farewell_channel_id: farewellChannelId.trim() === '' ? null : farewellChannelId.trim(),
        message,
        avatar_x: pos.x,
        avatar_y: pos.y,
        avatar_size: pos.size,
        show_name: showName,
      },
    });
  };

  return (
    <div className="grid gap-8">
      <form
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        onSubmit={onSubmit}
      >
        <h3 className="mb-4 text-lg font-semibold">{t('welcome.title')}</h3>

        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{t('welcome.enabled')}</span>
        </label>
        <p className="mb-3 ms-6 text-xs text-slate-500">{t('welcome.enabled.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('welcome.channelId')}</span>
          <ChannelSelect guildId={guildId} value={channelId} onChange={setChannelId} />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('welcome.channelId.hint')}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('welcome.autoRole')}</span>
          <RoleSelect guildId={guildId} value={autoRoleId} onChange={setAutoRoleId} />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('welcome.autoRole.hint')}</p>

        <MessageEditor
          label={t('welcome.message')}
          hint={t('welcome.message.hint')}
          value={message}
          onChange={setMessage}
          maxLength={MSG_MAX}
          sampleUser={me.data?.uname}
          guildId={guildId}
        />

        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
          <span>{t('welcome.showName')}</span>
        </label>
        <p className="mb-4 ms-6 text-xs text-slate-500">{t('welcome.showName.hint')}</p>

        <label className="mb-1 flex items-center gap-2">
          <input type="checkbox" checked={farewellEnabled} onChange={(e) => setFarewellEnabled(e.target.checked)} />
          <span>{t('welcome.farewell')}</span>
        </label>
        <p className="mb-3 ms-6 text-xs text-slate-500">{t('welcome.farewell.hint')}</p>
        {farewellEnabled && (
          <>
            <label className="mb-1 block">
              <span className="mb-1 block text-sm text-slate-400">{t('welcome.farewellChannel')}</span>
              <ChannelSelect guildId={guildId} value={farewellChannelId} onChange={setFarewellChannelId} />
            </label>
            <p className="mb-4 text-xs text-slate-500">{t('welcome.farewellChannel.hint')}</p>
            <MessageEditor
              label={t('welcome.farewellMessage')}
              hint={t('welcome.farewellMessage.hint')}
              value={farewellMessage}
              onChange={setFarewellMessage}
              maxLength={MSG_MAX}
              rows={3}
              sampleUser={me.data?.uname}
              guildId={guildId}
            />
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          data-testid="banner-file-input"
          onChange={(e) => {
            onFilePicked(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {!hasBanner && (
          <div
            role="button"
            tabIndex={0}
            aria-label={t('welcome.upload')}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="mb-4 flex h-40 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-slate-950/40 text-slate-400 transition hover:border-blue-400/50 hover:text-blue-300"
          >
            {upload.isPending ? t('welcome.uploading') : t('welcome.upload')}
          </div>
        )}

        {hasBanner && (
          <div className="mb-4">
            <span className="mb-1 block text-sm text-slate-400">{t('welcome.preview')}</span>
            <div
              ref={boxRef}
              className="relative w-full select-none overflow-hidden rounded-xl border border-white/10 bg-slate-950/60"
              style={{ aspectRatio: ratio ?? 16 / 9 }}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              <img
                src={bannerSrc}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) setRatio(img.naturalWidth / img.naturalHeight);
                }}
              />
              <div
                ref={handleRef}
                role="slider"
                tabIndex={0}
                aria-label={t('welcome.avatarHandle')}
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={pos.x}
                onPointerDown={onHandlePointerDown}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onKeyDown={onHandleKeyDown}
                className="absolute cursor-grab touch-none rounded-full border-2 border-blue-300 bg-blue-400/40 shadow-[0_0_16px_rgba(59,130,246,0.6)] active:cursor-grabbing"
                style={{
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  width: `${pos.size * 100}%`,
                  aspectRatio: '1 / 1',
                  transform: 'translate(-50%, -50%)',
                  containerType: 'size',
                }}
              >
                {/* WYSIWYG stand-in: the admin's own avatar + name, mirroring the render */}
                <img
                  src={avatarUrlOf(me.data)}
                  alt=""
                  data-testid="preview-avatar"
                  className="pointer-events-none h-full w-full select-none rounded-full object-cover"
                  draggable={false}
                />
                {showName && me.data?.uname && (
                  <span
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-bold text-white"
                    style={{
                      top: 'calc(100% + 8cqw)',
                      fontSize: '22cqw',
                      textShadow: '0 0 4px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)',
                    }}
                  >
                    {me.data.uname}
                  </span>
                )}
                <div
                  role="slider"
                  aria-label={t('welcome.resizeGrip')}
                  aria-valuemin={SIZE_MIN}
                  aria-valuemax={SIZE_MAX}
                  aria-valuenow={pos.size}
                  onPointerDown={onGripPointerDown}
                  onPointerMove={onGripPointerMove}
                  onPointerUp={onGripPointerUp}
                  className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize touch-none rounded-full border border-slate-900 bg-blue-300 shadow"
                />
              </div>
            </div>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-blue-400/50 hover:text-blue-300"
              >
                {upload.isPending ? t('welcome.uploading') : t('welcome.changeImage')}
              </button>
              <button
                type="button"
                onClick={() => removeBanner.mutate()}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-red-400/50 hover:text-red-300"
              >
                {t('welcome.removeImage')}
              </button>
            </div>
          </div>
        )}

        {upload.isError && <p className="mb-3 text-sm text-red-400">{t('welcome.uploadFailed')}</p>}

        <SaveBar saving={patch.isPending} />
      </form>
    </div>
  );
}
