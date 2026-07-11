import { useState } from 'react';
import type { BuiltinCommandKey, GuildCommandFlows } from '@gamebot/shared';
import { useI18n } from '../../i18n.js';
import { BUILTIN_KEYS, builtinNameKey } from './builtin-meta.js';

export type Selection = { kind: 'flow'; id: string } | { kind: 'builtin'; key: BuiltinCommandKey } | null;

function Dot({ on }: { on: boolean }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />;
}

export function FolderSidebar({
  draft,
  selection,
  onSelect,
  onChange,
}: {
  draft: GuildCommandFlows;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onChange: (next: GuildCommandFlows) => void;
}) {
  const { t } = useI18n();
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');

  const newCommand = (folder: string) => {
    const id = crypto.randomUUID();
    onChange({
      ...draft,
      flows: [
        ...draft.flows,
        {
          id,
          name: t('commands.newName'),
          folder,
          enabled: true,
          sources: { voice: true, text: false },
          triggers: [],
          match_mode: 'exact',
          llm_fallback: true,
          conditions: { role_ids: [], user_ids: [], channel_ids: [] },
          actions: [{ id: crypto.randomUUID(), type: 'speak_tts', text: '', pos: { x: 640, y: 120 } }],
          cooldown_seconds: 5,
          layout: { trigger: { x: 0, y: 120 }, condition: { x: 320, y: 120 } },
        },
      ],
    });
    onSelect({ kind: 'flow', id });
  };

  const addFolder = () => {
    const name = folderDraft.trim();
    if (name && name.toLowerCase() !== 'system' && !draft.folders.includes(name)) {
      onChange({ ...draft, folders: [...draft.folders, name] });
    }
    setFolderDraft('');
    setNewFolderMode(false);
  };

  const deleteFolder = (name: string) => {
    onChange({
      ...draft,
      folders: draft.folders.filter((f) => f !== name),
      flows: draft.flows.map((f) => (f.folder === name ? { ...f, folder: '' } : f)),
    });
  };

  const itemClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${
      active ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
    }`;

  const flowsIn = (folder: string) => draft.flows.filter((f) => f.folder === folder);
  const folders = ['', ...draft.folders];

  return (
    <aside className="w-64 shrink-0 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-400 px-2 py-1.5 text-sm font-semibold text-slate-950"
          onClick={() => newCommand('')}
        >
          ＋ {t('commands.new')}
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/10 px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5"
          onClick={() => setNewFolderMode(true)}
          title={t('commands.newFolder')}
        >
          🗂️
        </button>
      </div>
      {newFolderMode && (
        <input
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm focus:border-cyan-400/50 focus:outline-none"
          placeholder={t('commands.folderName')}
          value={folderDraft}
          maxLength={40}
          onChange={(e) => setFolderDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addFolder()}
          onBlur={addFolder}
        />
      )}

      {folders.map((folder) => (
        <div key={folder || '(root)'}>
          <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>{folder || t('commands.root')}</span>
            <span className="flex gap-1">
              <button type="button" className="hover:text-cyan-300" title={t('commands.new')} onClick={() => newCommand(folder)}>
                ＋
              </button>
              {folder && (
                <button
                  type="button"
                  className="hover:text-rose-300"
                  title={t('commands.deleteFolder')}
                  onClick={() => deleteFolder(folder)}
                >
                  ✕
                </button>
              )}
            </span>
          </div>
          <div className="space-y-0.5">
            {flowsIn(folder).map((flow) => (
              <button
                key={flow.id}
                type="button"
                className={itemClass(selection?.kind === 'flow' && selection.id === flow.id)}
                onClick={() => onSelect({ kind: 'flow', id: flow.id })}
              >
                <Dot on={flow.enabled} />
                <span className="truncate">{flow.name}</span>
              </button>
            ))}
            {flowsIn(folder).length === 0 && <p className="px-2.5 py-1 text-xs text-slate-600">—</p>}
          </div>
        </div>
      ))}

      <div>
        <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          ⚙️ {t('commands.system')}
        </div>
        <div className="space-y-0.5">
          {BUILTIN_KEYS.map((key) => {
            const ov = draft.builtin_overrides[key];
            const enabled = ov?.enabled !== false;
            return (
              <button
                key={key}
                type="button"
                className={`${itemClass(selection?.kind === 'builtin' && selection.key === key)} ${enabled ? '' : 'opacity-50'}`}
                onClick={() => onSelect({ kind: 'builtin', key })}
              >
                <Dot on={enabled} />
                <span className="truncate">{t(builtinNameKey(key))}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
