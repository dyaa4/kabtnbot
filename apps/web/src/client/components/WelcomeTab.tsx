import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface GuildConfigResp {
  welcome: {
    enabled: boolean;
    channel_id: string | null;
    message: string;
    banner_url: string | null;
    avatar_x: number;
    avatar_y: number;
    avatar_size: number;
    show_name: boolean;
  };
}

interface Pos {
  x: number;
  y: number;
  size: number;
}

const DEFAULT_POS: Pos = { x: 0.5, y: 0.4, size: 0.25 };

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function posTextOf(p: Pos): { x: string; y: string; size: string } {
  return { x: String(p.x), y: String(p.y), size: String(p.size) };
}

export function WelcomeTab({ guildId }: { guildId: string }) {
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

  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [message, setMessage] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [showName, setShowName] = useState(true);
  // `pos` is the committed numeric state used for the drag handle and for saving.
  // `posText` mirrors the raw text of the three number inputs so that typing a decimal
  // (e.g. "0", "0.", "0.3") is never reformatted mid-keystroke by a clamped numeric
  // round-trip - that reformatting corrupts what the user is typing and can leave the
  // native number input in a state that blocks form submission.
  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  const [posText, setPosText] = useState(posTextOf(DEFAULT_POS));

  const boxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (cfg.data) {
      const w = cfg.data.welcome;
      setEnabled(w.enabled);
      setChannelId(w.channel_id ?? '');
      setMessage(w.message);
      setBannerUrl(w.banner_url ?? '');
      setShowName(w.show_name);
      const next = { x: w.avatar_x, y: w.avatar_y, size: w.avatar_size };
      setPos(next);
      setPosText(posTextOf(next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  if (cfg.isLoading) return <p className="text-slate-400">{t('loading')}</p>;

  const commitPos = (next: Pos) => {
    setPos(next);
    setPosText(posTextOf(next));
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = round(clamp((clientX - rect.left) / rect.width, 0, 1));
    const y = round(clamp((clientY - rect.top) / rect.height, 0, 1));
    commitPos({ ...pos, x, y });
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
    if (e.key === 'ArrowLeft') commitPos({ ...pos, x: round(clamp(pos.x - step, 0, 1)) });
    else if (e.key === 'ArrowRight') commitPos({ ...pos, x: round(clamp(pos.x + step, 0, 1)) });
    else if (e.key === 'ArrowUp') commitPos({ ...pos, y: round(clamp(pos.y - step, 0, 1)) });
    else if (e.key === 'ArrowDown') commitPos({ ...pos, y: round(clamp(pos.y + step, 0, 1)) });
    else return;
    e.preventDefault();
  };

  const onNumberInputChange =
    (field: keyof Pos, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setPosText((prev) => ({ ...prev, [field]: raw }));
      const n = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(n)) {
        setPos((p) => ({ ...p, [field]: clamp(n, min, max) }));
      }
    };

  const onNumberInputBlur = (field: keyof Pos) => () => {
    setPosText((prev) => ({ ...prev, [field]: String(pos[field]) }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedChannel = channelId.trim();
    const trimmedBanner = bannerUrl.trim();
    patch.mutate({
      welcome: {
        enabled,
        channel_id: trimmedChannel === '' ? null : trimmedChannel,
        message,
        banner_url: trimmedBanner === '' ? null : trimmedBanner,
        avatar_x: pos.x,
        avatar_y: pos.y,
        avatar_size: pos.size,
        show_name: showName,
      },
    });
  };

  const hasBanner = bannerUrl.trim() !== '';

  return (
    <div className="grid gap-8">
      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/30 px-4 py-2 text-emerald-300 backdrop-blur-md">
          {t('settings.saved')}
        </div>
      )}

      <form
        className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md"
        onSubmit={onSubmit}
      >
        <h3 className="mb-4 text-lg font-semibold">{t('welcome.title')}</h3>

        <label className="mb-3 flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{t('welcome.enabled')}</span>
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-400">{t('welcome.channelId')}</span>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          />
        </label>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm text-slate-400">{t('welcome.message')}</span>
          <textarea
            className="h-24 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <p className="mb-4 text-xs text-slate-500">{t('welcome.message.hint')}</p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-400">{t('welcome.bannerUrl')}</span>
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
            value={bannerUrl}
            onChange={(e) => setBannerUrl(e.target.value)}
          />
        </label>

        <label className="mb-4 flex items-center gap-2">
          <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
          <span>{t('welcome.showName')}</span>
        </label>

        {hasBanner && (
          <div className="mb-4">
            <span className="mb-1 block text-sm text-slate-400">{t('welcome.preview')}</span>
            <div
              ref={boxRef}
              className="relative w-full select-none overflow-hidden rounded-xl border border-white/10 bg-slate-950/60"
              style={{ aspectRatio: '16 / 9' }}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
            >
              <img src={bannerUrl} alt="" className="h-full w-full object-cover" draggable={false} />
              <div
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
                className="absolute cursor-grab touch-none rounded-full border-2 border-cyan-300 bg-cyan-400/40 shadow-[0_0_16px_rgba(34,211,238,0.6)] active:cursor-grabbing"
                style={{
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  width: `${pos.size * 100}%`,
                  aspectRatio: '1 / 1',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
          </div>
        )}

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">{t('welcome.avatarX')}</span>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
              value={posText.x}
              onChange={onNumberInputChange('x', 0, 1)}
              onBlur={onNumberInputBlur('x')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">{t('welcome.avatarY')}</span>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
              value={posText.y}
              onChange={onNumberInputChange('y', 0, 1)}
              onBlur={onNumberInputBlur('y')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">{t('welcome.avatarSize')}</span>
            <input
              type="number"
              step={0.01}
              min={0.05}
              max={0.6}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus:border-cyan-400/50 focus:outline-none"
              value={posText.size}
              onChange={onNumberInputChange('size', 0.05, 0.6)}
              onBlur={onNumberInputBlur('size')}
            />
          </label>
        </div>

        <button
          className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-4 py-2 font-semibold text-slate-950 shadow-[0_0_20px_-6px_rgba(99,102,241,0.7)] transition hover:scale-[1.02] hover:shadow-[0_0_26px_-4px_rgba(34,211,238,0.8)]"
          type="submit"
        >
          {t('settings.save')}
        </button>
      </form>
    </div>
  );
}
