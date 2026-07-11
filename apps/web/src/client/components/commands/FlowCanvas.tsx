import { useMemo } from 'react';
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
import { builtinNameKey } from './builtin-meta.js';

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
} as unknown as NodeTypes;

const ACTION_TYPES: FlowActionType[] = [
  'speak_tts', 'send_message', 'ai_reply', 'voice_leave', 'voice_stop_listening',
  'voice_disconnect_user', 'voice_move_user', 'timeout_user', 'role_add', 'role_remove',
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
  builtin?: {
    key: BuiltinCommandKey;
    override: BuiltinOverride;
    onChange: (next: BuiltinOverride) => void;
  };
}) {
  const { t } = useI18n();

  const { nodes, edges } = useMemo((): { nodes: Node[]; edges: Edge[] } => {
    if (flow && onFlowChange) {
      const update = (patch: Partial<CommandFlow>) => onFlowChange({ ...flow, ...patch });
      const nodes: Node[] = [
        { id: 'trigger', type: 'trigger', position: flow.layout.trigger, data: { flow, update } },
        {
          id: 'condition',
          type: 'condition',
          position: flow.layout.condition,
          data: {
            guildId,
            roleIds: flow.conditions.role_ids,
            userIds: flow.conditions.user_ids,
            channelIds: flow.conditions.channel_ids,
            onChange: (patch: Partial<CommandFlow['conditions']>) =>
              update({ conditions: { ...flow.conditions, ...patch } }),
          },
        },
        ...flow.actions.map((action) => ({
          id: action.id,
          type: 'action',
          position: action.pos,
          data: {
            guildId,
            action,
            update: (patch: Partial<FlowAction>) =>
              update({
                actions: flow.actions.map((a) => (a.id === action.id ? ({ ...a, ...patch } as FlowAction) : a)),
              }),
            remove:
              flow.actions.length > 1
                ? () => update({ actions: flow.actions.filter((a) => a.id !== action.id) })
                : undefined,
          },
        })),
      ];
      return { nodes, edges: chainEdges(['trigger', 'condition', ...flow.actions.map((a) => a.id)]) };
    }

    if (builtin) {
      const { key, override, onChange } = builtin;
      const pos = {
        trigger: override.layout.trigger ?? { x: 0, y: 120 },
        condition: override.layout.condition ?? { x: 300, y: 120 },
        action: override.layout.action ?? { x: 640, y: 120 },
      };
      const nodes: Node[] = [
        {
          id: 'trigger',
          type: 'trigger',
          position: pos.trigger,
          data: {
            flow: null,
            update: () => {},
            builtin: {
              extraTriggers: override.extra_triggers,
              setExtraTriggers: (extra_triggers: string[]) => onChange({ ...override, extra_triggers }),
            },
          },
        },
        {
          id: 'condition',
          type: 'condition',
          position: pos.condition,
          data: {
            guildId,
            roleIds: override.role_ids,
            userIds: override.user_ids,
            onChange: (patch: { role_ids?: string[]; user_ids?: string[] }) => onChange({ ...override, ...patch }),
          },
        },
        {
          id: 'builtin-action',
          type: 'action',
          position: pos.action,
          data: {
            guildId,
            action: { id: 'builtin', type: 'voice_leave', pos: pos.action },
            update: () => {},
            readonlyLabel: t(builtinNameKey(key)),
          },
        },
      ];
      return { nodes, edges: chainEdges(['trigger', 'condition', 'builtin-action']) };
    }

    return { nodes: [], edges: [] };
  }, [guildId, flow, onFlowChange, builtin, t]);

  const onNodeDragStop = (_e: unknown, node: Node) => {
    const position = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    if (flow && onFlowChange) {
      if (node.id === 'trigger') onFlowChange({ ...flow, layout: { ...flow.layout, trigger: position } });
      else if (node.id === 'condition') onFlowChange({ ...flow, layout: { ...flow.layout, condition: position } });
      else {
        onFlowChange({
          ...flow,
          actions: flow.actions.map((a) => (a.id === node.id ? ({ ...a, pos: position } as FlowAction) : a)),
        });
      }
    } else if (builtin) {
      const slot = node.id === 'trigger' ? 'trigger' : node.id === 'condition' ? 'condition' : 'action';
      builtin.onChange({ ...builtin.override, layout: { ...builtin.override.layout, [slot]: position } });
    }
  };

  return (
    // React Flow's coordinate system is LTR — pin the canvas to LTR even when
    // the surrounding dashboard renders RTL (Arabic).
    <div dir="ltr" className="h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
      <ReactFlowProvider>
        <ReactFlow
          key={flow?.id ?? builtin?.key ?? 'empty'}
          colorMode="dark"
          nodes={nodes}
          edges={edges}
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
          {flow && onFlowChange && (
            <Panel position="top-right">
              <select
                className="rounded-lg border border-white/10 bg-slate-900/90 px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-400/50 focus:outline-none"
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
            </Panel>
          )}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
