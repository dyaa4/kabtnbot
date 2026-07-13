import { memo, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { CommandFlow, FlowAction, FlowActionType } from '@gamebot/shared';
import { useI18n } from '../../../i18n.js';
import { ACTION_GROUPS, defaultAction, useCanvas } from '../FlowCanvas.js';
import { builtinNameKey } from '../builtin-meta.js';
import { useRoles, useTextChannels, useVoiceChannels } from '../pickers.js';
import { MemberSearchBox } from '../UserSearchSelect.js';

const INPUT_CLASS =
  'nodrag w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm focus:border-cyan-400/50 focus:outline-none';

/**
 * Message textarea with one-click placeholder chips ({user}/{args}/{mention})
 * and an @-picker that inserts a real member mention (<@id>) at the cursor.
 */
function MessageField({
  guildId,
  value,
  maxLength,
  onChange,
  hint,
}: {
  guildId: string;
  value: string;
  maxLength: number;
  onChange: (v: string) => void;
  hint: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);

  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    onChange((value.slice(0, start) + token + value.slice(end)).slice(0, maxLength));
    el?.focus();
  };

  const chipClass =
    'nodrag rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200';

  return (
    <>
      <textarea
        ref={ref}
        className={`${INPUT_CLASS} nowheel mt-2 h-20`}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {(['{user}', '{args}', '{mention}'] as const).map((token) => (
          <button key={token} type="button" dir="ltr" className={chipClass} onClick={() => insert(token)}>
            {token}
          </button>
        ))}
        <button
          type="button"
          className={`${chipClass} ${mentionOpen ? 'border-cyan-400/50 text-cyan-200' : ''}`}
          onClick={() => setMentionOpen((o) => !o)}
        >
          @ {t('commands.action.mentionMember')}
        </button>
      </div>
      {mentionOpen && (
        <div className="mt-1.5">
          <MemberSearchBox
            guildId={guildId}
            onPick={(m) => {
              insert(`<@${m.id}>`);
              setMentionOpen(false);
            }}
          />
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </>
  );
}

function TargetPicker({
  value,
  onChange,
}: {
  value: 'speaker' | 'spoken_name';
  onChange: (v: 'speaker' | 'spoken_name') => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.action.target')}</label>
      <select className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value as 'speaker' | 'spoken_name')}>
        <option value="speaker">{t('commands.action.target.speaker')}</option>
        <option value="spoken_name">{t('commands.action.target.spokenName')}</option>
      </select>
    </>
  );
}

function Params({
  guildId,
  action,
  update,
}: {
  guildId: string;
  action: FlowAction;
  update: (patch: Partial<FlowAction>) => void;
}) {
  const { t } = useI18n();
  const roles = useRoles(guildId);
  const textChannels = useTextChannels(guildId);
  const voiceChannels = useVoiceChannels(guildId);

  const channelSelect = (options: { id: string; name: string }[], value: string) => (
    <select className={INPUT_CLASS} value={value} onChange={(e) => update({ channel_id: e.target.value } as Partial<FlowAction>)}>
      <option value="">—</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          #{c.name}
        </option>
      ))}
      {value && !options.some((c) => c.id === value) && <option value={value}>{value}</option>}
    </select>
  );

  switch (action.type) {
    case 'voice_leave':
    case 'voice_stop_listening':
      return null;
    case 'voice_disconnect_user':
      return <TargetPicker value={action.target} onChange={(target) => update({ target } as Partial<FlowAction>)} />;
    case 'voice_move_user':
      return (
        <>
          <TargetPicker value={action.target} onChange={(target) => update({ target } as Partial<FlowAction>)} />
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.condition.channels')}</label>
          {channelSelect(voiceChannels.data ?? [], action.channel_id)}
        </>
      );
    case 'speak_tts':
      return (
        <MessageField
          guildId={guildId}
          value={action.text}
          maxLength={500}
          onChange={(text) => update({ text } as Partial<FlowAction>)}
          hint={t('commands.action.textHint')}
        />
      );
    case 'send_message':
      return (
        <>
          {channelSelect(textChannels.data ?? [], action.channel_id)}
          <MessageField
            guildId={guildId}
            value={action.text}
            maxLength={2000}
            onChange={(text) => update({ text } as Partial<FlowAction>)}
            hint={t('commands.action.textHint')}
          />
        </>
      );
    case 'timeout_user':
      return (
        <>
          <TargetPicker value={action.target} onChange={(target) => update({ target } as Partial<FlowAction>)} />
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.action.duration')}</label>
          <input
            type="number"
            min={1}
            max={10080}
            className={INPUT_CLASS}
            value={action.duration_minutes}
            onChange={(e) => update({ duration_minutes: Math.max(1, Number(e.target.value) || 1) } as Partial<FlowAction>)}
          />
        </>
      );
    case 'role_add':
    case 'role_remove':
      return (
        <>
          <TargetPicker value={action.target} onChange={(target) => update({ target } as Partial<FlowAction>)} />
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.condition.roles')}</label>
          <select
            className={INPUT_CLASS}
            value={action.role_id}
            onChange={(e) => update({ role_id: e.target.value } as Partial<FlowAction>)}
          >
            <option value="">—</option>
            {roles.data?.map((r) => (
              <option key={r.id} value={r.id}>
                @{r.name}
              </option>
            ))}
            {action.role_id && !roles.data?.some((r) => r.id === action.role_id) && (
              <option value={action.role_id}>{action.role_id}</option>
            )}
          </select>
        </>
      );
    case 'ai_reply':
      return (
        <textarea
          className={`${INPUT_CLASS} nowheel mt-1 h-24`}
          maxLength={2000}
          value={action.system_prompt}
          onChange={(e) => update({ system_prompt: e.target.value } as Partial<FlowAction>)}
        />
      );
    case 'dm_user':
      return (
        <>
          <TargetPicker value={action.target} onChange={(target) => update({ target } as Partial<FlowAction>)} />
          <MessageField
            guildId={guildId}
            value={action.text}
            maxLength={1000}
            onChange={(text) => update({ text } as Partial<FlowAction>)}
            hint={t('commands.action.textHint')}
          />
        </>
      );
    case 'dm_inactive_members':
      return (
        <>
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.action.days')}</label>
          <input
            type="number"
            min={1}
            max={90}
            className={INPUT_CLASS}
            value={action.days}
            onChange={(e) => update({ days: Math.min(90, Math.max(1, Number(e.target.value) || 1)) } as Partial<FlowAction>)}
          />
          <MessageField
            guildId={guildId}
            value={action.text}
            maxLength={1000}
            onChange={(text) => update({ text } as Partial<FlowAction>)}
            hint={t('commands.action.dmInactiveHint')}
          />
        </>
      );
  }
}

export const ActionNode = memo(function ActionNode({
  data,
}: {
  data: { actionId?: string; builtinAction?: boolean };
}) {
  const { t } = useI18n();
  const { guildId, flow, change, builtin } = useCanvas();

  if (data.builtinAction || !flow) {
    return (
      <div className="w-72 rounded-2xl border border-emerald-400/30 bg-slate-900 p-4 shadow-[0_0_24px_-8px_rgba(52,211,153,0.5)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <span>⚡</span>
          {builtin ? t(builtinNameKey(builtin.key)) : ''}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('commands.builtin.actionLabel')}</p>
        <Handle type="target" position={Position.Left} className="!bg-emerald-400" />
      </div>
    );
  }

  const index = flow.actions.findIndex((a) => a.id === data.actionId);
  const action = flow.actions[index];
  if (!action) return null;

  const update = (patch: Partial<FlowAction>) =>
    change({
      actions: flow.actions.map((a) => (a.id === action.id ? ({ ...a, ...patch } as FlowAction) : a)),
    } as Partial<CommandFlow>);
  const remove =
    flow.actions.length > 1
      ? () => change({ actions: flow.actions.filter((a) => a.id !== action.id) } as Partial<CommandFlow>)
      : undefined;

  // Swap execution order with the chain neighbor — positions swap too so the
  // nodes trade places on the canvas instead of the edges crossing.
  const move = (dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= flow.actions.length) return;
    const actions = [...flow.actions];
    const a = actions[index];
    const b = actions[j];
    actions[index] = { ...b, pos: a.pos } as FlowAction;
    actions[j] = { ...a, pos: b.pos } as FlowAction;
    change({ actions } as Partial<CommandFlow>);
  };

  const duplicate = () => {
    if (flow.actions.length >= 5) return;
    const copy = { ...action, id: crypto.randomUUID(), pos: { x: action.pos.x + 48, y: action.pos.y + 200 } } as FlowAction;
    const actions = [...flow.actions];
    actions.splice(index + 1, 0, copy);
    change({ actions } as Partial<CommandFlow>);
  };

  // Change the type in place: fresh defaults for the new type, but keep the
  // node identity/position and carry over text/target when both types use it.
  const changeType = (type: FlowActionType) => {
    if (type === action.type) return;
    const next = { ...defaultAction(type, index), id: action.id, pos: action.pos } as FlowAction;
    for (const key of ['text', 'target'] as const) {
      if (key in action && key in next) {
        (next as Record<string, unknown>)[key] = (action as Record<string, unknown>)[key];
      }
    }
    change({ actions: flow.actions.map((a) => (a.id === action.id ? next : a)) } as Partial<CommandFlow>);
  };

  const toolBtnClass = (enabled: boolean) =>
    `nodrag rounded-lg px-1 text-sm ${enabled ? 'text-slate-500 hover:bg-white/10 hover:text-cyan-200' : 'cursor-default text-slate-700'}`;

  return (
    <div className="w-72 rounded-2xl border border-emerald-400/30 bg-slate-900 p-4 shadow-[0_0_24px_-8px_rgba(52,211,153,0.5)]">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[11px] font-bold text-emerald-300">
          {3 + index}
        </span>
        <span>⚡</span>
        <select
          aria-label={t('commands.action.changeType')}
          title={t('commands.action.changeType')}
          className="nodrag min-w-0 flex-1 cursor-pointer rounded-lg border border-transparent bg-transparent py-0.5 text-sm font-semibold text-emerald-300 hover:border-white/10 focus:border-cyan-400/50 focus:outline-none"
          value={action.type}
          onChange={(e) => changeType(e.target.value as FlowActionType)}
        >
          {ACTION_GROUPS.map(([group, types]) => (
            <optgroup key={group} label={t(`commands.action.group.${group}`)}>
              {types.map((type) => (
                <option key={type} value={type} className="bg-slate-900 text-slate-200">
                  {t(`commands.action.${type}`)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {flow.actions.length > 1 && (
          <>
            <button type="button" className={toolBtnClass(index > 0)} disabled={index === 0} onClick={() => move(-1)} title={t('commands.action.moveEarlier')}>
              ←
            </button>
            <button
              type="button"
              className={toolBtnClass(index < flow.actions.length - 1)}
              disabled={index === flow.actions.length - 1}
              onClick={() => move(1)}
              title={t('commands.action.moveLater')}
            >
              →
            </button>
          </>
        )}
        <button
          type="button"
          className={toolBtnClass(flow.actions.length < 5)}
          disabled={flow.actions.length >= 5}
          onClick={duplicate}
          title={flow.actions.length >= 5 ? t('commands.action.max') : t('commands.action.duplicate')}
        >
          ⧉
        </button>
        {remove && (
          <button
            type="button"
            className="nodrag rounded-lg px-1 text-sm text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"
            onClick={remove}
            title={t('commands.action.remove')}
          >
            ✕
          </button>
        )}
      </div>
      <Params guildId={guildId} action={action} update={update} />
      <Handle type="target" position={Position.Left} className="!bg-emerald-400" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400" />
    </div>
  );
});
