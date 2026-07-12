import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GuildCommandFlowsSchema,
  type BuiltinCommandKey,
  type BuiltinOverride,
  type CommandFlow,
  type GuildCommandFlows,
} from '@gamebot/shared';
import { api, ApiError } from '../../api.js';
import { useI18n } from '../../i18n.js';
import { SaveBar } from '../SaveBar.js';
import { FormSkeleton } from '../Skeleton.js';
import { useToast } from '../Toast.js';
import { FolderSidebar, type Selection } from './FolderSidebar.js';
import { FlowCanvas, defaultAction } from './FlowCanvas.js';
import { SlashCommandPanel } from './SlashCommandPanel.js';
import { builtinNameKey } from './builtin-meta.js';

const DEFAULT_OVERRIDE: BuiltinOverride = {
  enabled: true,
  extra_triggers: [],
  role_ids: [],
  user_ids: [],
  layout: {},
};

const INPUT_CLASS =
  'rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm focus:border-cyan-400/50 focus:outline-none';

// Discord slash-command names: lowercase, no spaces, letters/digits/-/_ (Arabic ok).
function sanitizeSlashName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^-_\p{Ll}\p{Lo}\p{N}]/gu, '').slice(0, 32);
}

export function CommandsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();

  const flowsQuery = useQuery({
    queryKey: ['command-flows', guildId],
    queryFn: () => api<GuildCommandFlows>(`/api/guilds/${guildId}/command-flows`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
    // A window-focus refetch must never clobber an in-progress draft.
    refetchOnWindowFocus: false,
  });

  const [draft, setDraft] = useState<GuildCommandFlows | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  // The editor is sized to EXACTLY fill the viewport below the page chrome
  // (header + tab nav), and page scrolling is locked while it fits — the
  // canvas gets the whole screen, nothing scrolls except the sidebar.
  const rootRef = useRef<HTMLFormElement>(null);
  const [editorHeight, setEditorHeight] = useState<number>();
  useEffect(() => {
    const measure = () => {
      if (!rootRef.current) return;
      window.scrollTo(0, 0);
      const avail = window.innerHeight - rootRef.current.getBoundingClientRect().top - 12;
      setEditorHeight(Math.max(560, avail));
      document.body.style.overflow = avail >= 560 ? 'hidden' : '';
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      document.body.style.overflow = '';
    };
  }, [draft === null]);

  // A guild switch must drop the previous guild's draft — otherwise stale
  // flows could be saved into the newly selected guild.
  useEffect(() => {
    setDraft(null);
    setSelection(null);
  }, [guildId]);

  // Initialize the draft ONCE from the first load — later refetches would
  // otherwise silently wipe unsaved edits.
  useEffect(() => {
    if (flowsQuery.data) setDraft((prev) => prev ?? structuredClone(flowsQuery.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowsQuery.data]);

  const save = useMutation({
    mutationFn: (body: GuildCommandFlows) =>
      api<GuildCommandFlows>(`/api/guilds/${guildId}/command-flows`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (saved) => {
      toast.success(t('settings.saved'));
      // Sync cache + draft to the server-parsed result (defaults filled) so
      // the save bar disarms without a refetch racing the local state.
      qc.setQueryData(['command-flows', guildId], saved);
      setDraft(structuredClone(saved));
    },
    onError: (err) => {
      const detail = err instanceof ApiError && err.message ? ` (${err.message})` : '';
      toast.error(`${t('error.generic')}${detail}`);
    },
  });

  if (flowsQuery.error instanceof ApiError && flowsQuery.error.code === 'PREMIUM_REQUIRED') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-12 text-center backdrop-blur-md">
        <span className="text-4xl">💎</span>
        <h3 className="text-lg font-semibold text-amber-200">{t('commands.premium.title')}</h3>
        <p className="max-w-md text-sm text-slate-400">{t('commands.premium.body')}</p>
      </div>
    );
  }

  // Non-premium failures (500, network) must not leave the skeleton up forever.
  if (flowsQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/5 p-12 text-center backdrop-blur-md">
        <p className="text-sm text-slate-300">{t('error.generic')}</p>
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-400/50"
          onClick={() => void flowsQuery.refetch()}
        >
          ↻
        </button>
      </div>
    );
  }

  if (flowsQuery.isLoading || !draft) return <FormSkeleton sections={1} />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(flowsQuery.data);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate client-side with the SAME schema the server enforces, so the
    // user gets a pointed error (which command, which field) before the PUT.
    const parsed = GuildCommandFlowsSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const flowIdx = issue.path[0] === 'flows' ? (issue.path[1] as number) : null;
      const name = flowIdx !== null ? draft.flows[flowIdx]?.name : '';
      toast.error(`${t('commands.invalid')}${name ? ` „${name}"` : ''}: ${issue.message}`);
      return;
    }
    save.mutate(parsed.data);
  };

  const selectedFlow = selection?.kind === 'flow' ? draft.flows.find((f) => f.id === selection.id) : undefined;
  const selectedBuiltin = selection?.kind === 'builtin' ? selection.key : undefined;
  const selectedSlash = selection?.kind === 'slash' ? selection.key : undefined;
  const overrideOf = (key: BuiltinCommandKey): BuiltinOverride =>
    draft.builtin_overrides[key] ?? structuredClone(DEFAULT_OVERRIDE);

  // One-click starter templates for the empty state — a prefilled flow is far
  // easier to tweak than an empty canvas. `null` = blank command.
  const createFromTemplate = (type: 'speak_tts' | 'ai_reply' | 'send_message' | null) => {
    const id = crypto.randomUUID();
    const action = defaultAction(type ?? 'speak_tts', 0);
    if (action.type === 'speak_tts' && type) action.text = t('commands.template.reply.text');
    if (action.type === 'send_message') action.text = t('commands.template.reply.text');
    if (action.type === 'ai_reply') action.system_prompt = t('commands.template.ai.prompt');
    const flow: CommandFlow = {
      id,
      name: t('commands.newName'),
      folder: '',
      enabled: true,
      sources: { voice: true, text: false },
      triggers: type ? [t('commands.template.trigger')] : [],
      match_mode: type === 'ai_reply' ? 'prefix' : 'exact',
      llm_fallback: true,
      conditions: { role_ids: [], user_ids: [], channel_ids: [] },
      actions: [action],
      cooldown_seconds: 5,
      slash_name: '',
      layout: { trigger: { x: 0, y: 120 }, condition: { x: 320, y: 120 } },
    };
    setDraft({ ...draft, flows: [...draft.flows, flow] });
    setSelection({ kind: 'flow', id });
  };

  const updateFlow = (next: CommandFlow) =>
    setDraft({ ...draft, flows: draft.flows.map((f) => (f.id === next.id ? next : f)) });
  const updateOverride = (key: BuiltinCommandKey, next: BuiltinOverride) =>
    setDraft({ ...draft, builtin_overrides: { ...draft.builtin_overrides, [key]: next } });
  const deleteFlow = (id: string) => {
    setDraft({ ...draft, flows: draft.flows.filter((f) => f.id !== id) });
    setSelection(null);
  };

  return (
    // Break out of the layout's max-w-4xl: the flow editor needs the whole
    // viewport width (centered, capped at 1700px). left-1/2 + -translate-x-1/2
    // centers a wider-than-parent block in both LTR and RTL. The measured
    // height makes the whole editor fit the viewport with no page scroll.
    <form
      ref={rootRef}
      onSubmit={onSubmit}
      style={{ height: editorHeight ?? 'calc(100vh - 230px)' }}
      className="relative left-1/2 flex w-[min(100vw-2rem,1700px)] -translate-x-1/2 flex-col gap-3"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <FolderSidebar draft={draft} selection={selection} onSelect={setSelection} onChange={setDraft} />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {selectedFlow && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
              <input
                className={`${INPUT_CLASS} w-48 font-semibold`}
                value={selectedFlow.name}
                maxLength={60}
                onChange={(e) => updateFlow({ ...selectedFlow, name: e.target.value })}
              />
              <select
                className={INPUT_CLASS}
                value={selectedFlow.folder}
                onChange={(e) => updateFlow({ ...selectedFlow, folder: e.target.value })}
              >
                <option value="">{t('commands.root')}</option>
                {draft.folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={selectedFlow.enabled}
                  onChange={(e) => updateFlow({ ...selectedFlow, enabled: e.target.checked })}
                />
                {t('commands.enabled')}
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={selectedFlow.slash_name !== ''}
                  onChange={(e) =>
                    updateFlow({
                      ...selectedFlow,
                      slash_name: e.target.checked ? sanitizeSlashName(selectedFlow.name) || 'command' : '',
                    })
                  }
                />
                {t('commands.slashExpose')}
              </label>
              {selectedFlow.slash_name !== '' && (
                <span dir="ltr" className="flex items-center gap-0.5 font-mono text-sm text-cyan-300">
                  /
                  <input
                    dir="ltr"
                    className={`${INPUT_CLASS} w-36 font-mono`}
                    value={selectedFlow.slash_name}
                    maxLength={32}
                    onChange={(e) => updateFlow({ ...selectedFlow, slash_name: sanitizeSlashName(e.target.value) })}
                  />
                </span>
              )}
              <button
                type="button"
                className="ms-auto rounded-lg border border-rose-400/30 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-400/10"
                onClick={() => deleteFlow(selectedFlow.id)}
              >
                {t('commands.deleteCommand')}
              </button>
            </div>
          )}

          {selectedBuiltin && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
              <span className="font-semibold text-slate-200">
                ⚙️ {t(builtinNameKey(selectedBuiltin))}
              </span>
              <label className="ms-auto flex items-center gap-1.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={overrideOf(selectedBuiltin).enabled}
                  onChange={(e) =>
                    updateOverride(selectedBuiltin, { ...overrideOf(selectedBuiltin), enabled: e.target.checked })
                  }
                />
                {t('commands.enabled')}
              </label>
            </div>
          )}

          {selectedFlow ? (
            <div className="min-h-0 flex-1">
              <FlowCanvas guildId={guildId} flow={selectedFlow} onFlowChange={updateFlow} />
            </div>
          ) : selectedBuiltin ? (
            <div className="min-h-0 flex-1">
              <FlowCanvas
                guildId={guildId}
                builtin={{
                  key: selectedBuiltin,
                  override: overrideOf(selectedBuiltin),
                  onChange: (next) => updateOverride(selectedBuiltin, next),
                }}
              />
            </div>
          ) : selectedSlash ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SlashCommandPanel guildId={guildId} draft={draft} cmd={selectedSlash} onChange={setDraft} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">{t('commands.start.title')}</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t('commands.start.hint')}</p>
              </div>
              <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
                {([['speak_tts', '🗣️'], ['ai_reply', '🤖'], ['send_message', '💬']] as const).map(([type, emoji]) => (
                  <button
                    key={type}
                    type="button"
                    className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-white/10"
                    onClick={() => createFromTemplate(type)}
                  >
                    <span className="text-3xl">{emoji}</span>
                    {t(`commands.action.${type}`)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
                onClick={() => createFromTemplate(null)}
              >
                ＋ {t('commands.start.blank')}
              </button>
            </div>
          )}
        </div>
      </div>
      <SaveBar dirty={dirty} saving={save.isPending} />
    </form>
  );
}
