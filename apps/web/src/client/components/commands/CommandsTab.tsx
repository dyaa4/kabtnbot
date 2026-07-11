import { useEffect, useState } from 'react';
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
import { FlowCanvas } from './FlowCanvas.js';
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

export function CommandsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();

  const flowsQuery = useQuery({
    queryKey: ['command-flows', guildId],
    queryFn: () => api<GuildCommandFlows>(`/api/guilds/${guildId}/command-flows`),
  });

  const [draft, setDraft] = useState<GuildCommandFlows | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    if (flowsQuery.data) setDraft(structuredClone(flowsQuery.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowsQuery.data]);

  const save = useMutation({
    mutationFn: (body: GuildCommandFlows) =>
      api(`/api/guilds/${guildId}/command-flows`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(t('settings.saved'));
      void qc.invalidateQueries({ queryKey: ['command-flows', guildId] });
    },
    onError: (err) => {
      const detail = err instanceof ApiError && err.message ? ` (${err.message})` : '';
      toast.error(`${t('error.generic')}${detail}`);
    },
  });

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
  const overrideOf = (key: BuiltinCommandKey): BuiltinOverride =>
    draft.builtin_overrides[key] ?? structuredClone(DEFAULT_OVERRIDE);

  const updateFlow = (next: CommandFlow) =>
    setDraft({ ...draft, flows: draft.flows.map((f) => (f.id === next.id ? next : f)) });
  const updateOverride = (key: BuiltinCommandKey, next: BuiltinOverride) =>
    setDraft({ ...draft, builtin_overrides: { ...draft.builtin_overrides, [key]: next } });
  const deleteFlow = (id: string) => {
    setDraft({ ...draft, flows: draft.flows.filter((f) => f.id !== id) });
    setSelection(null);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <FolderSidebar draft={draft} selection={selection} onSelect={setSelection} onChange={setDraft} />

        <div className="min-w-0 flex-1 space-y-3">
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
            <FlowCanvas guildId={guildId} flow={selectedFlow} onFlowChange={updateFlow} />
          ) : selectedBuiltin ? (
            <FlowCanvas
              guildId={guildId}
              builtin={{
                key: selectedBuiltin,
                override: overrideOf(selectedBuiltin),
                onChange: (next) => updateOverride(selectedBuiltin, next),
              }}
            />
          ) : (
            <div className="flex h-[560px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-slate-500">
              {t('commands.empty')}
            </div>
          )}
        </div>
      </div>
      <SaveBar dirty={dirty} saving={save.isPending} />
    </form>
  );
}
