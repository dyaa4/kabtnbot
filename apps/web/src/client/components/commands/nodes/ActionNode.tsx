import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { CommandFlow, FlowAction } from '@gamebot/shared';
import { useI18n } from '../../../i18n.js';
import { useCanvas } from '../FlowCanvas.js';
import { builtinNameKey } from '../builtin-meta.js';
import { useRoles, useTextChannels, useVoiceChannels } from '../pickers.js';

const INPUT_CLASS =
  'nodrag w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm focus:border-cyan-400/50 focus:outline-none';

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
        <>
          <textarea
            className={`${INPUT_CLASS} nowheel mt-1 h-20`}
            maxLength={500}
            value={action.text}
            onChange={(e) => update({ text: e.target.value } as Partial<FlowAction>)}
          />
          <p className="mt-1 text-xs text-slate-500">{t('commands.action.textHint')}</p>
        </>
      );
    case 'send_message':
      return (
        <>
          {channelSelect(textChannels.data ?? [], action.channel_id)}
          <textarea
            className={`${INPUT_CLASS} nowheel mt-2 h-20`}
            maxLength={2000}
            value={action.text}
            onChange={(e) => update({ text: e.target.value } as Partial<FlowAction>)}
          />
          <p className="mt-1 text-xs text-slate-500">{t('commands.action.textHint')}</p>
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
          <textarea
            className={`${INPUT_CLASS} nowheel mt-2 h-20`}
            maxLength={1000}
            value={action.text}
            onChange={(e) => update({ text: e.target.value } as Partial<FlowAction>)}
          />
          <p className="mt-1 text-xs text-slate-500">{t('commands.action.textHint')}</p>
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
          <textarea
            className={`${INPUT_CLASS} nowheel mt-2 h-20`}
            maxLength={1000}
            value={action.text}
            onChange={(e) => update({ text: e.target.value } as Partial<FlowAction>)}
          />
          <p className="mt-1 text-xs text-slate-500">{t('commands.action.dmInactiveHint')}</p>
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

  const action = flow.actions.find((a) => a.id === data.actionId);
  if (!action) return null;

  const update = (patch: Partial<FlowAction>) =>
    change({
      actions: flow.actions.map((a) => (a.id === action.id ? ({ ...a, ...patch } as FlowAction) : a)),
    } as Partial<CommandFlow>);
  const remove =
    flow.actions.length > 1
      ? () => change({ actions: flow.actions.filter((a) => a.id !== action.id) } as Partial<CommandFlow>)
      : undefined;

  return (
    <div className="w-72 rounded-2xl border border-emerald-400/30 bg-slate-900 p-4 shadow-[0_0_24px_-8px_rgba(52,211,153,0.5)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[11px] font-bold">3</span>
          <span>⚡</span>
          {t(`commands.action.${action.type}`)}
        </div>
        {remove && (
          <button
            type="button"
            className="nodrag rounded-lg px-1.5 text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"
            onClick={remove}
            title="×"
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
