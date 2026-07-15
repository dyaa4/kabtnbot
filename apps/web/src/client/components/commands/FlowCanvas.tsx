import { LayoutGrid, Maximize2, Minimize2 } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  type XYPosition,
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

// Action types grouped for the pickers (add-action select + in-node type
// select) — the group order mirrors how often each family is used.
export const ACTION_GROUPS: readonly [string, readonly FlowActionType[]][] = [
  ['messages', ['speak_tts', 'send_message', 'send_voice_chat', 'ai_reply', 'dm_user', 'dm_inactive_members']],
  ['voice', ['voice_leave', 'voice_stop_listening', 'voice_disconnect_user', 'voice_move_user']],
  ['moderation', ['timeout_user', 'role_add', 'role_remove']],
];

// One color per action TYPE — the node card, its handles, its outgoing edge
// and its minimap dot all share it, so a glance at the canvas reads the
// chain's behavior. Full class literals (no interpolation): Tailwind's JIT
// only generates classes it can see verbatim in the source.
export interface ActionStyle {
  card: string;
  accent: string;
  badge: string;
  handle: string;
  hex: string;
}

export const ACTION_STYLES: Record<FlowActionType, ActionStyle> = {
  speak_tts: {
    card: 'border-cyan-400/40 shadow-[0_0_24px_-8px_rgba(34,211,238,0.5)]',
    accent: 'text-cyan-300', badge: 'bg-cyan-400/25 text-cyan-300', handle: '!bg-cyan-400', hex: '#22d3ee',
  },
  send_message: {
    card: 'border-blue-400/40 shadow-[0_0_24px_-8px_rgba(96,165,250,0.5)]',
    accent: 'text-blue-300', badge: 'bg-blue-400/25 text-blue-300', handle: '!bg-blue-400', hex: '#60a5fa',
  },
  send_voice_chat: {
    card: 'border-lime-400/40 shadow-[0_0_24px_-8px_rgba(163,230,53,0.5)]',
    accent: 'text-lime-300', badge: 'bg-lime-400/25 text-lime-300', handle: '!bg-lime-400', hex: '#a3e635',
  },
  ai_reply: {
    card: 'border-violet-400/40 shadow-[0_0_24px_-8px_rgba(167,139,250,0.5)]',
    accent: 'text-violet-300', badge: 'bg-violet-400/25 text-violet-300', handle: '!bg-violet-400', hex: '#a78bfa',
  },
  dm_user: {
    card: 'border-indigo-400/40 shadow-[0_0_24px_-8px_rgba(129,140,248,0.5)]',
    accent: 'text-indigo-300', badge: 'bg-indigo-400/25 text-indigo-300', handle: '!bg-indigo-400', hex: '#818cf8',
  },
  dm_inactive_members: {
    card: 'border-fuchsia-400/40 shadow-[0_0_24px_-8px_rgba(232,121,249,0.5)]',
    accent: 'text-fuchsia-300', badge: 'bg-fuchsia-400/25 text-fuchsia-300', handle: '!bg-fuchsia-400', hex: '#e879f9',
  },
  voice_leave: {
    card: 'border-teal-400/40 shadow-[0_0_24px_-8px_rgba(45,212,191,0.5)]',
    accent: 'text-teal-300', badge: 'bg-teal-400/25 text-teal-300', handle: '!bg-teal-400', hex: '#2dd4bf',
  },
  voice_stop_listening: {
    card: 'border-sky-400/40 shadow-[0_0_24px_-8px_rgba(56,189,248,0.5)]',
    accent: 'text-sky-300', badge: 'bg-sky-400/25 text-sky-300', handle: '!bg-sky-400', hex: '#38bdf8',
  },
  voice_disconnect_user: {
    card: 'border-orange-400/40 shadow-[0_0_24px_-8px_rgba(251,146,60,0.5)]',
    accent: 'text-orange-300', badge: 'bg-orange-400/25 text-orange-300', handle: '!bg-orange-400', hex: '#fb923c',
  },
  voice_move_user: {
    card: 'border-amber-400/40 shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)]',
    accent: 'text-amber-300', badge: 'bg-amber-400/25 text-amber-300', handle: '!bg-amber-400', hex: '#fbbf24',
  },
  timeout_user: {
    card: 'border-red-400/40 shadow-[0_0_24px_-8px_rgba(248,113,113,0.5)]',
    accent: 'text-red-300', badge: 'bg-red-400/25 text-red-300', handle: '!bg-red-400', hex: '#f87171',
  },
  role_add: {
    card: 'border-emerald-400/40 shadow-[0_0_24px_-8px_rgba(52,211,153,0.5)]',
    accent: 'text-emerald-300', badge: 'bg-emerald-400/25 text-emerald-300', handle: '!bg-emerald-400', hex: '#34d399',
  },
  role_remove: {
    card: 'border-rose-400/40 shadow-[0_0_24px_-8px_rgba(251,113,133,0.5)]',
    accent: 'text-rose-300', badge: 'bg-rose-400/25 text-rose-300', handle: '!bg-rose-400', hex: '#fb7185',
  },
};

// Trigger + condition family color (the "when & who" side of the canvas).
const FLOW_HEX = '#3b82f6';

export function defaultAction(type: FlowActionType, index: number): FlowAction {
  const base = { id: crypto.randomUUID(), pos: { x: 640 + index * 320, y: 120 }, repeat_minutes: 0 as const };
  const targeted = { target: 'speaker' as const, target_user_id: '' };
  switch (type) {
    case 'voice_leave':
    case 'voice_stop_listening':
      return { ...base, type };
    case 'voice_disconnect_user':
      return { ...base, type, ...targeted };
    case 'voice_move_user':
      return { ...base, type, ...targeted, channel_id: '' };
    case 'speak_tts':
    case 'send_voice_chat':
      return { ...base, type, text: '' };
    case 'send_message':
      return { ...base, type, channel_id: '', text: '' };
    case 'timeout_user':
      return { ...base, type, ...targeted, duration_minutes: 5 };
    case 'role_add':
    case 'role_remove':
      return { ...base, type, ...targeted, role_id: '' };
    case 'ai_reply':
      return { ...base, type, system_prompt: '' };
    case 'dm_user':
      return { ...base, type, ...targeted, target_user_ids: [], target_role_ids: [], text: '' };
    case 'dm_inactive_members':
      return { ...base, type, days: 14, text: '' };
  }
}

const PANEL_BTN_CLASS =
  'flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 hover:border-blue-400/50 focus:border-blue-400/50 focus:outline-none';

// Lives inside <ReactFlow> so it can reach the internal store: the canvas is
// uncontrolled, so persisting tidy positions alone would not move anything
// until the next structure remount — the store must be updated too.
function ArrangeButton({ arrange }: { arrange: () => Record<string, XYPosition> }) {
  const rf = useReactFlow();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={PANEL_BTN_CLASS}
      title={t('commands.canvas.arrange')}
      onClick={() => {
        const pos = arrange();
        rf.setNodes((ns) => ns.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)));
        requestAnimationFrame(() => void rf.fitView({ padding: 0.15, maxZoom: 1 }));
      }}
    >
      <LayoutGrid className="h-4 w-4" /> {t('commands.canvas.arrange')}
    </button>
  );
}

// Each edge carries its SOURCE node's color, so the chain reads like a
// colored pipeline; the arrowhead makes the execution direction obvious.
function chainEdges(items: { id: string; hex: string }[]): Edge[] {
  return items.slice(0, -1).map((item, i) => ({
    id: `e-${item.id}-${items[i + 1].id}`,
    source: item.id,
    target: items[i + 1].id,
    animated: true,
    style: { stroke: item.hex, strokeWidth: 1.5, opacity: 0.8 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: item.hex },
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
  // another command selected, actions added/removed/reordered, or an action
  // RETYPED (its color propagates into the baked edges). Typing in node forms
  // never touches React Flow's store. Fullscreen is part of the key so the
  // canvas refits to the new viewport size.
  const canvasKey = flow
    ? `flow:${flow.id}:${flow.actions.map((a) => `${a.id}=${a.type}`).join('.')}:${fullscreen}`
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
      return {
        nodes,
        edges: chainEdges([
          { id: 'trigger', hex: FLOW_HEX },
          { id: 'condition', hex: FLOW_HEX },
          ...flow.actions.map((a) => ({ id: a.id, hex: ACTION_STYLES[a.type].hex })),
        ]),
      };
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
      return {
        nodes,
        edges: chainEdges([
          { id: 'trigger', hex: FLOW_HEX },
          { id: 'condition', hex: FLOW_HEX },
          { id: 'builtin-action', hex: '#38bdf8' },
        ]),
      };
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

  // Tidy layout: one straight left-to-right chain on the 320px grid the
  // default positions already use. Persists through the normal change path
  // and returns the map so ArrangeButton can move the live store nodes.
  const arrange = (): Record<string, XYPosition> => {
    const pos: Record<string, XYPosition> = { trigger: { x: 0, y: 120 }, condition: { x: 320, y: 120 } };
    if (flow && onFlowChange) {
      flow.actions.forEach((a, i) => {
        pos[a.id] = { x: 640 + i * 320, y: 120 };
      });
      onFlowChange({
        ...flow,
        layout: { trigger: pos.trigger, condition: pos.condition },
        actions: flow.actions.map((a) => ({ ...a, pos: pos[a.id] }) as FlowAction),
      });
    } else if (builtin) {
      pos['builtin-action'] = { x: 640, y: 120 };
      builtin.onChange({
        ...builtin.override,
        layout: { trigger: pos.trigger, condition: pos.condition, action: pos['builtin-action'] },
      });
    }
    return pos;
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
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.3}
            className="!bg-transparent"
          >
            <Background gap={24} color="rgba(255,255,255,0.06)" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              style={{ width: 140, height: 90 }}
              className="!m-2 rounded-lg border border-white/10 !bg-slate-900"
              maskColor="rgba(2,6,23,0.6)"
              nodeColor={(n) => {
                if (n.type !== 'action') return FLOW_HEX;
                const action = flow?.actions.find((a) => a.id === n.id);
                return action ? ACTION_STYLES[action.type].hex : '#38bdf8';
              }}
            />
            <Panel position="top-right" className="flex items-center gap-2">
              {flow && onFlowChange && (
                <select
                  className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-400/50 focus:outline-none"
                  value=""
                  disabled={flow.actions.length >= 5}
                  title={flow.actions.length >= 5 ? t('commands.action.max') : t('commands.action.add')}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    onFlowChange({
                      ...flow,
                      actions: [...flow.actions, defaultAction(e.target.value as FlowActionType, flow.actions.length)],
                    });
                  }}
                >
                  <option value="">＋ {t('commands.action.add')}</option>
                  {ACTION_GROUPS.map(([group, types]) => (
                    <optgroup key={group} label={t(`commands.action.group.${group}`)}>
                      {types.map((type) => (
                        <option key={type} value={type}>
                          {t(`commands.action.${type}`)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              <ArrangeButton arrange={arrange} />
              <button
                type="button"
                onClick={() => setFullscreen((f) => !f)}
                title={fullscreen ? t('commands.canvas.exitFullscreen') : t('commands.canvas.fullscreen')}
                className={PANEL_BTN_CLASS}
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {fullscreen ? t('commands.canvas.exitFullscreen') : t('commands.canvas.fullscreen')}
              </button>
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
      </CanvasContext.Provider>
    </div>
  );
}
