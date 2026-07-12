import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { BuiltinCommandKey, BuiltinOverride, CommandFlow, FlowAction, FlowActionType } from '@gamebot/shared';
import { useI18n } from '../../i18n.js';
import { TriggerNode } from './nodes/TriggerNode.js';
import { ConditionNode } from './nodes/ConditionNode.js';
import { ActionNode } from './nodes/ActionNode.js';

// Node components read the LIVE flow from this context instead of node data.
// That keeps React Flow uncontrolled (its internal store owns dragging — no
// prop-sync per frame) while form edits still re-render the node bodies.
export interface CanvasCtx {
  guildId: string;
  flow?: CommandFlow;
  change: (patch: Partial<CommandFlow>) => void;
  builtin?: {
    key: BuiltinCommandKey;
    override: BuiltinOverride;
    onChange: (next: BuiltinOverride) => void;
  };
}

const CanvasContext = createContext<CanvasCtx | null>(null);

export function useCanvas(): CanvasCtx {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas outside FlowCanvas');
  return ctx;
}

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
} as unknown as NodeTypes;

const ACTION_TYPES: FlowActionType[] = [
  'speak_tts', 'send_message', 'ai_reply', 'dm_user', 'dm_inactive_members',
  'voice_leave', 'voice_stop_listening', 'voice_disconnect_user', 'voice_move_user',
  'timeout_user', 'role_add', 'role_remove',
];

export function defaultAction(type: FlowActionType, index: number): FlowAction {
  const base = { id: crypto.randomUUID(), pos: { x: 640 + index * 320, y: 120 } };
  switch (type) {
    case 'voice_leave':
    case 'voice_stop_listening':
      return { ...base, type };
    case 'voice_disconnect_user':
      return { ...base, type, target: 'speaker' };
    case 'voice_move_user':
      return { ...base, type, target: 'speaker', channel_id: '' };
    case 'speak_tts':
      return { ...base, type, text: '' };
    case 'send_message':
      return { ...base, type, channel_id: '', text: '' };
    case 'timeout_user':
      return { ...base, type, target: 'speaker', duration_minutes: 5 };
    case 'role_add':
    case 'role_remove':
      return { ...base, type, target: 'speaker', role_id: '' };
    case 'ai_reply':
      return { ...base, type, system_prompt: '' };
    case 'dm_user':
      return { ...base, type, target: 'speaker', text: '' };
    case 'dm_inactive_members':
      return { ...base, type, days: 14, text: '' };
  }
}

function chainEdges(ids: string[]): Edge[] {
  return ids.slice(0, -1).map((id, i) => ({
    id: `e-${id}-${ids[i + 1]}`,
    source: id,
    target: ids[i + 1],
    animated: true,
    style: { stroke: 'rgba(139,92,246,0.6)' },
  }));
}

export function FlowCanvas({
  guildId,
  flow,
  onFlowChange,
  builtin,
}: {
  guildId: string;
  flow?: CommandFlow;
  onFlowChange?: (next: CommandFlow) => void;
  builtin?: CanvasCtx['builtin'];
}) {
  const { t } = useI18n();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    // Restore the PREVIOUS value on exit — the commands tab locks page scroll
    // itself, and blindly resetting to '' would undo that lock.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  // Remount the (uncontrolled) canvas only when the STRUCTURE changes:
  // another command selected, or actions added/removed. Typing in node
  // forms never touches React Flow's store. Fullscreen is part of the key
  // so the canvas refits to the new viewport size.
  const canvasKey = flow
    ? `flow:${flow.id}:${flow.actions.map((a) => a.id).join('.')}:${fullscreen}`
    : `builtin:${builtin?.key ?? 'none'}:${fullscreen}`;

  const ctx: CanvasCtx = {
    guildId,
    flow,
    change: (patch) => flow && onFlowChange?.({ ...flow, ...patch }),
    builtin,
  };

  // Initial nodes/edges for the uncontrolled canvas — only positions matter
  // here; live form values come from context.
  const { nodes, edges } = useMemo((): { nodes: Node[]; edges: Edge[] } => {
    if (flow) {
      const nodes: Node[] = [
        { id: 'trigger', type: 'trigger', position: flow.layout.trigger, data: {} },
        { id: 'condition', type: 'condition', position: flow.layout.condition, data: {} },
        ...flow.actions.map((action) => ({
          id: action.id,
          type: 'action',
          position: action.pos,
          data: { actionId: action.id },
        })),
      ];
      return { nodes, edges: chainEdges(['trigger', 'condition', ...flow.actions.map((a) => a.id)]) };
    }
    if (builtin) {
      const pos = {
        trigger: builtin.override.layout.trigger ?? { x: 0, y: 120 },
        condition: builtin.override.layout.condition ?? { x: 300, y: 120 },
        action: builtin.override.layout.action ?? { x: 640, y: 120 },
      };
      const nodes: Node[] = [
        { id: 'trigger', type: 'trigger', position: pos.trigger, data: {} },
        { id: 'condition', type: 'condition', position: pos.condition, data: {} },
        { id: 'builtin-action', type: 'action', position: pos.action, data: { builtinAction: true } },
      ];
      return { nodes, edges: chainEdges(['trigger', 'condition', 'builtin-action']) };
    }
    return { nodes: [], edges: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasKey]);

  // Persist EVERY dragged node, not just the grabbed one — a multi-select drag
  // (Ctrl-click several, drag one) moves them all in React Flow's store, and
  // any unpersisted position snaps back on the next structure remount/save.
  // All updates fold into ONE change call so none overwrites the others.
  const onNodeDragStop = (_e: unknown, node: Node, nodes?: Node[]) => {
    const moved = nodes && nodes.length > 0 ? nodes : [node];
    const posOf = (n: Node) => ({ x: Math.round(n.position.x), y: Math.round(n.position.y) });
    if (flow && onFlowChange) {
      let next = flow;
      for (const n of moved) {
        const position = posOf(n);
        if (n.id === 'trigger') next = { ...next, layout: { ...next.layout, trigger: position } };
        else if (n.id === 'condition') next = { ...next, layout: { ...next.layout, condition: position } };
        else {
          next = {
            ...next,
            actions: next.actions.map((a) => (a.id === n.id ? ({ ...a, pos: position } as FlowAction) : a)),
          };
        }
      }
      onFlowChange(next);
    } else if (builtin) {
      let layout = builtin.override.layout;
      for (const n of moved) {
        const slot = n.id === 'trigger' ? 'trigger' : n.id === 'condition' ? 'condition' : 'action';
        layout = { ...layout, [slot]: posOf(n) };
      }
      builtin.onChange({ ...builtin.override, layout });
    }
  };

  return (
    // React Flow's coordinate system is LTR — pin the canvas to LTR even when
    // the surrounding dashboard renders RTL (Arabic).
    <div
      dir="ltr"
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-slate-950'
          : 'h-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40'
      }
    >
      <CanvasContext.Provider value={ctx}>
        <ReactFlowProvider>
          <ReactFlow
            key={canvasKey}
            colorMode="dark"
            defaultNodes={nodes}
            defaultEdges={edges}
            nodeTypes={nodeTypes}
            onNodeDragStop={onNodeDragStop}
            nodesConnectable={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.3}
            className="!bg-transparent"
          >
            <Background gap={24} color="rgba(255,255,255,0.06)" />
            <Controls showInteractive={false} />
            <Panel position="top-right" className="flex items-center gap-2">
              {flow && onFlowChange && (
                <select
                  className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-400/50 focus:outline-none"
                  value=""
                  disabled={flow.actions.length >= 5}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    onFlowChange({
                      ...flow,
                      actions: [...flow.actions, defaultAction(e.target.value as FlowActionType, flow.actions.length)],
                    });
                  }}
                >
                  <option value="">＋ {t('commands.action.add')}</option>
                  {ACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`commands.action.${type}`)}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setFullscreen((f) => !f)}
                title={fullscreen ? t('commands.canvas.exitFullscreen') : t('commands.canvas.fullscreen')}
                className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 hover:border-cyan-400/50 focus:border-cyan-400/50 focus:outline-none"
              >
                {fullscreen ? '✕ ' + t('commands.canvas.exitFullscreen') : '⛶ ' + t('commands.canvas.fullscreen')}
              </button>
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
      </CanvasContext.Provider>
    </div>
  );
}
