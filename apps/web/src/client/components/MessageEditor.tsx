import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';

interface GuildEmoji {
  id: string;
  name: string;
  animated: boolean;
}

function emojiCdnUrl(e: GuildEmoji): string {
  return `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=32`;
}

/** Discord's inline form for custom emojis: <:name:id> / <a:name:id> (animated). */
function emojiCode(e: GuildEmoji): string {
  return `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
}

const CUSTOM_EMOJI_RE = /<(a?):(\w+):(\d+)>/g;

/** Render message text with custom-emoji codes replaced by CDN images. */
function renderWithCustomEmojis(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CUSTOM_EMOJI_RE)) {
    if (m.index! > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <img
        key={`${m[3]}-${m.index}`}
        src={`https://cdn.discordapp.com/emojis/${m[3]}.${m[1] === 'a' ? 'gif' : 'png'}?size=32`}
        alt={`:${m[2]}:`}
        className="inline-block h-5 w-5 align-text-bottom"
      />,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Curated emoji palette — grouped, dependency-free. The OS picker (Win+. / 🌐+E)
// still works inside the textarea for anything not listed here.
const EMOJI_GROUPS: { icon: string; emojis: string[] }[] = [
  {
    icon: '😀',
    emojis: [
      '😀', '😄', '😁', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩',
      '😜', '🤪', '😏', '🥳', '🤗', '🫡', '😴', '🤯', '😱', '👻',
      '💀', '🤖', '👾', '😈', '🔥', '✨', '⭐', '🌟', '💫', '⚡',
    ],
  },
  {
    icon: '🎮',
    emojis: [
      '🎮', '🕹️', '🎯', '🎲', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅',
      '⚔️', '🛡️', '🗡️', '🏹', '💣', '🧨', '🚀', '🛸', '🏁', '🎪',
      '🃏', '🎰', '👑', '💎', '🪙', '💰', '📀', '💿', '🔫', '🧿',
    ],
  },
  {
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💗',
      '💘', '💝', '💞', '💕', '❣️', '💟', '🫶', '🤝', '👍', '👋',
      '🙌', '👏', '🤙', '✌️', '🤞', '💪', '🫰', '🙏', '🤲', '👊',
    ],
  },
  {
    icon: '🎉',
    emojis: [
      '🎉', '🎊', '🎈', '🎁', '🎀', '🪅', '🍾', '🥂', '☕', '🍕',
      '🍔', '🌮', '🍩', '🍿', '📢', '📣', '🔔', '💬', '💭', '🗨️',
      '✅', '❌', '⚠️', '❗', '❓', '➡️', '⬅️', '🔸', '🔹', '🌙',
    ],
  },
];

const TAGS = [
  { snippet: '{user}', icon: '👤', key: 'editor.tag.user' },
  { snippet: '{server}', icon: '🏠', key: 'editor.tag.server' },
  { snippet: '{count}', icon: '#️⃣', key: 'editor.tag.count' },
] as const;

export interface MessageEditorProps {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  rows?: number;
  /** Stand-in for {user} in the live preview (e.g. the logged-in admin's name). */
  sampleUser?: string;
  /** When set, the emoji panel also offers this guild's custom emojis. */
  guildId?: string;
}

/**
 * Professional message field for welcome/farewell texts: placeholder-tag
 * buttons and an emoji palette that insert at the caret, a live preview with
 * sample values, and the maxLength counter. RTL-safe, no external deps.
 */
export function MessageEditor({ label, hint, value, onChange, maxLength, rows = 4, sampleUser, guildId }: MessageEditorProps) {
  const { t } = useI18n();
  const guildEmojis = useQuery({
    queryKey: ['emojis', guildId],
    enabled: guildId !== undefined,
    staleTime: 5 * 60_000,
    queryFn: () => api<GuildEmoji[]>(`/api/guilds/${guildId}/emojis`),
  });
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const labelId = useId();

  const insert = (snippet: string) => {
    const el = taRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    if (next.length > maxLength) return;
    onChange(next);
    // Restore focus and put the caret right after the inserted snippet once
    // React has flushed the new value into the textarea.
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  // Close the emoji popover on Escape or any pointer press outside of it.
  useEffect(() => {
    if (!emojiOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEmojiOpen(false);
    };
    const onPress = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!popoverRef.current?.contains(target) && !emojiBtnRef.current?.contains(target)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [emojiOpen]);

  const preview = value
    .replaceAll('{user}', sampleUser ?? 'Player1')
    .replaceAll('{server}', t('editor.sampleServer'))
    .replaceAll('{count}', '128');

  return (
    <div className="mb-1">
      <span id={labelId} className="mb-1 block text-sm text-slate-400">
        {label}
      </span>

      <div className="rounded-xl border border-white/10 bg-slate-950/60 transition focus-within:border-cyan-400/50">
        {/* toolbar */}
        <div className="relative flex flex-wrap items-center gap-1.5 border-b border-white/5 px-2 py-1.5">
          {TAGS.map(({ snippet, icon, key }) => (
            <button
              key={snippet}
              type="button"
              onClick={() => insert(snippet)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-300"
            >
              {icon} {t(key)}
            </button>
          ))}
          <button
            ref={emojiBtnRef}
            type="button"
            aria-label={t('editor.emoji')}
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen((o) => !o)}
            className="ms-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm transition hover:border-cyan-400/40"
          >
            😊
          </button>

          {emojiOpen && (
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={t('editor.emoji')}
              className="absolute end-0 top-full z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-xl backdrop-blur-xl"
            >
              {(guildEmojis.data?.length ?? 0) > 0 && (
                <div className="mb-1">
                  <span className="block px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-400/70">
                    {t('editor.serverEmojis')}
                  </span>
                  <div className="grid grid-cols-10">
                    {guildEmojis.data!.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        title={`:${e.name}:`}
                        aria-label={`:${e.name}:`}
                        onClick={() => insert(emojiCode(e))}
                        className="rounded-md p-1 transition hover:bg-white/10"
                      >
                        <img src={emojiCdnUrl(e)} alt="" className="h-5 w-5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {EMOJI_GROUPS.map((group) => (
                <div key={group.icon} className="mb-1">
                  <span aria-hidden="true" className="block px-1 pb-0.5 pt-1 text-xs opacity-60">
                    {group.icon}
                  </span>
                  <div className="grid grid-cols-10">
                    {group.emojis.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insert(e)}
                        className="rounded-md p-1 text-lg leading-none transition hover:bg-white/10"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <textarea
          ref={taRef}
          aria-labelledby={labelId}
          className="w-full resize-y bg-transparent px-3 py-2 focus:outline-none"
          rows={rows}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>

      <p className="mb-1 mt-1 flex justify-between gap-4 text-xs text-slate-500">
        <span>{hint}</span>
        <span dir="ltr">{`${value.length}/${maxLength}`}</span>
      </p>

      {value.trim() !== '' && (
        <div
          data-testid="message-preview"
          className="mb-3 rounded-xl border border-white/5 bg-slate-900/60 px-3 py-2 text-sm text-slate-300"
        >
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-cyan-400/70">
            {t('editor.preview')}
          </span>
          <span className="whitespace-pre-wrap">{renderWithCustomEmojis(preview)}</span>
        </div>
      )}
    </div>
  );
}
