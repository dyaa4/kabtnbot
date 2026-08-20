import { ArrowLeft, ArrowRight, AtSign, Copy, MessageSquareText, Timer, User, X, Zap } from 'lucide-react';
import { memo, useRef, useState, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { JOIN_BUSIEST_CHANNEL, type CommandFlow, type FlowAction, type FlowActionType } from '@gamebot/shared';
import { useI18n } from '../../../i18n.js';
import { ACTION_GROUPS, ACTION_STYLES, defaultAction, useCanvas } from '../FlowCanvas.js';
import { IntervalPicker } from '../IntervalPicker.js';
import { builtinNameKey } from '../builtin-meta.js';
import { MultiSelect, useRoles, useTextChannels, useVoiceChannels } from '../pickers.js';
import { MemberSearchBox, SingleMemberSelect, UserSearchSelect } from '../UserSearchSelect.js';

// Friendly placeholder chips: localized label + icon; clicking inserts the
// raw token the bot understands ({user}/{args}/{mention}) at the cursor.
const PLACEHOLDERS = [
  { token: '{user}', icon: User, key: 'commands.ph.user' },
  { token: '{args}', icon: MessageSquareText, key: 'commands.ph.args' },
  { token: '{mention}', icon: AtSign, key: 'commands.ph.mention' },
] as const;

const INPUT_CLASS =
  'nodrag w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm focus:border-sky-400/50 focus:outline-none';

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
  hint?: string;
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
    'nodrag inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300 hover:border-sky-400/40 hover:text-sky-200';

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
        {PLACEHOLDERS.map(({ token, icon: Icon, key }) => (
          <button key={token} type="button" title={token} className={chipClass} onClick={() => insert(token)}>
            <Icon className="h-3 w-3" /> {t(key)}
          </button>
        ))}
        <button
          type="button"
          className={`${chipClass} ${mentionOpen ? 'border-sky-400/50 text-sky-200' : ''}`}
          onClick={() => setMentionOpen((o) => !o)}
        >
          <AtSign className="h-3 w-3" /> {t('commands.action.mentionMember')}
        </button>
      </div>
      {mentionOpen && (
        <div className="mt-1.5">
          <MemberSearchBox
            guildId={guildId}
            onPick={(m) => {
              // Trailing space: a mention glued to the next word (<@id>play)
              // is invisible in the editor but breaks other bots' parsers.
              insert(`<@${m.id}> `);
              setMentionOpen(false);
            }}
          />
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
}

type TargetValue = 'speaker' | 'spoken_name' | 'member';

function TargetPicker({
  guildId,
  target,
  userId,
  update,
  memberOptionLabel,
  memberPicker,
}: {
  guildId: string;
  target: TargetValue;
  userId: string;
  update: (patch: Partial<FlowAction>) => void;
  /** dm_user overrides: option text + a multi member/role picker. */
  memberOptionLabel?: string;
  memberPicker?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.action.target')}</label>
      <select
        aria-label={t('commands.action.target')}
        className={INPUT_CLASS}
        value={target}
        onChange={(e) => update({ target: e.target.value as TargetValue } as Partial<FlowAction>)}
      >
        <option value="speaker">{t('commands.action.target.speaker')}</option>
        <option value="spoken_name">{t('commands.action.target.spokenName')}</option>
        <option value="member">{memberOptionLabel ?? t('commands.action.target.member')}</option>
      </select>
      {target === 'member' && (
        <div className="mt-1.5">
          {memberPicker ?? (
            <SingleMemberSelect
              guildId={guildId}
              value={userId}
              onChange={(target_user_id) => update({ target_user_id } as Partial<FlowAction>)}
            />
          )}
        </div>
      )}
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
    case 'voice_join':
      return (
        <>
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.condition.channels')}</label>
          <select
            className={INPUT_CLASS}
            value={action.channel_id}
            onChange={(e) => update({ channel_id: e.target.value } as Partial<FlowAction>)}
          >
            <option value="">{t('commands.action.join.invoker')}</option>
            <option value={JOIN_BUSIEST_CHANNEL}>{t('commands.action.join.busiest')}</option>
            {(voiceChannels.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
            {action.channel_id &&
              action.channel_id !== JOIN_BUSIEST_CHANNEL &&
              !voiceChannels.data?.some((c) => c.id === action.channel_id) && (
                <option value={action.channel_id}>{action.channel_id}</option>
              )}
          </select>
          <p className="mt-1 text-xs text-slate-500">{t('commands.action.joinHint')}</p>
        </>
      );
    case 'voice_disconnect_user':
      return <TargetPicker guildId={guildId} target={action.target} userId={action.target_user_id} update={update} />;
    case 'voice_move_user':
      return (
        <>
          <TargetPicker guildId={guildId} target={action.target} userId={action.target_user_id} update={update} />
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.condition.channels')}</label>
          {channelSelect(voiceChannels.data ?? [], action.channel_id)}
        </>
      );
    case 'voice_distribute':
      return (
        <>
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.action.distribute.groupSize')}</label>
          <input
            type="number"
            min={2}
            max={20}
            className={INPUT_CLASS}
            value={action.group_size}
            onChange={(e) => update({ group_size: Math.min(20, Math.max(2, Number(e.target.value) || 2)) } as Partial<FlowAction>)}
          />
          <p className="mt-1 text-xs text-slate-500">{t('commands.action.distribute.groupSizeHint')}</p>
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.action.distribute.baseName')}</label>
          <input
            type="text"
            maxLength={32}
            className={INPUT_CLASS}
            value={action.base_name}
            placeholder={t('commands.action.distribute.baseNamePlaceholder')}
            onChange={(e) => update({ base_name: e.target.value } as Partial<FlowAction>)}
          />
          <p className="mt-1 text-xs text-slate-500">{t('commands.action.distribute.baseNameHint')}</p>
        </>
      );
    case 'speak_tts':
      return (
        <MessageField
          guildId={guildId}
          value={action.text}
          maxLength={500}
          onChange={(text) => update({ text } as Partial<FlowAction>)}
        />
      );
    case 'send_voice_chat':
      return (
        <MessageField
          guildId={guildId}
          value={action.text}
          maxLength={2000}
          onChange={(text) => update({ text } as Partial<FlowAction>)}
          hint={t('commands.action.voiceChatHint')}
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
          />
        </>
      );
    case 'timeout_user':
      return (
        <>
          <TargetPicker guildId={guildId} target={action.target} userId={action.target_user_id} update={update} />
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
          <TargetPicker guildId={guildId} target={action.target} userId={action.target_user_id} update={update} />
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
          <TargetPicker
            guildId={guildId}
            target={action.target}
            userId={action.target_user_id}
            update={update}
            memberOptionLabel={t('commands.action.target.members')}
            memberPicker={
              <>
                <label className="mb-1 block text-xs text-slate-400">{t('commands.action.dm.members')}</label>
                <UserSearchSelect
                  guildId={guildId}
                  values={action.target_user_ids}
                  onChange={(target_user_ids) => update({ target_user_ids } as Partial<FlowAction>)}
                />
                <label className="mb-1 mt-2 block text-xs text-slate-400">{t('commands.action.dm.roles')}</label>
                <MultiSelect
                  options={roles.data ?? []}
                  values={action.target_role_ids}
                  onChange={(target_role_ids) => update({ target_role_ids } as Partial<FlowAction>)}
                  prefix="@"
                  placeholder={t('commands.condition.roles')}
                />
              </>
            }
          />
          <MessageField
            guildId={guildId}
            value={action.text}
            maxLength={1000}
            onChange={(text) => update({ text } as Partial<FlowAction>)}
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
      <div className="w-72 rounded-2xl border border-sky-400/30 bg-slate-900 p-4 shadow-[0_0_24px_-8px_rgba(56,189,248,0.5)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-sky-300">
          <Zap className="h-4 w-4 shrink-0" />
          {builtin ? t(builtinNameKey(builtin.key)) : ''}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('commands.builtin.actionLabel')}</p>
        <Handle type="target" position={Position.Left} className="!bg-sky-400" />
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
    const next = { ...defaultAction(type, index), id: action.id, pos: action.pos, repeat_minutes: action.repeat_minutes } as FlowAction;
    for (const key of ['text', 'target', 'target_user_id'] as const) {
      if (key in action && key in next) {
        (next as Record<string, unknown>)[key] = (action as Record<string, unknown>)[key];
      }
    }
    change({ actions: flow.actions.map((a) => (a.id === action.id ? next : a)) } as Partial<CommandFlow>);
  };

  const toolBtnClass = (enabled: boolean) =>
    `nodrag rounded-lg px-1 text-sm ${enabled ? 'text-slate-500 hover:bg-white/10 hover:text-sky-200' : 'cursor-default text-slate-700'}`;

  // Per-type color: card border/glow, badge, type select, handles and the
  // outgoing edge (FlowCanvas) all share it.
  const style = ACTION_STYLES[action.type];

  return (
    <div className={`w-72 rounded-2xl border bg-slate-900 p-4 ${style.card}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${style.badge}`}>
          {3 + index}
        </span>
        <Zap className={`h-4 w-4 shrink-0 ${style.accent}`} />
        <select
          aria-label={t('commands.action.changeType')}
          title={t('commands.action.changeType')}
          className={`nodrag min-w-0 flex-1 cursor-pointer rounded-lg border border-transparent bg-transparent py-0.5 text-sm font-semibold hover:border-white/10 focus:border-white/30 focus:outline-none ${style.accent}`}
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
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={toolBtnClass(index < flow.actions.length - 1)}
              disabled={index === flow.actions.length - 1}
              onClick={() => move(1)}
              title={t('commands.action.moveLater')}
            >
              <ArrowRight className="h-3.5 w-3.5" />
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
          <Copy className="h-3.5 w-3.5" />
        </button>
        {remove && (
          <button
            type="button"
            className="nodrag rounded-lg px-1 text-sm text-slate-500 hover:bg-sky-400/10 hover:text-sky-200"
            onClick={remove}
            title={t('commands.action.remove')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Params guildId={guildId} action={action} update={update} />

      {/* Own cadence for this step — only meaningful while the flow schedule
          is on, so the section stays hidden otherwise. */}
      {flow.schedule.enabled && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <label className={`flex items-center gap-1.5 text-xs font-semibold ${style.accent}`}>
            <input
              type="checkbox"
              className="nodrag"
              checked={action.repeat_minutes > 0}
              onChange={(e) => update({ repeat_minutes: e.target.checked ? 60 : 0 } as Partial<FlowAction>)}
            />
            <Timer className="h-3.5 w-3.5" /> {t('commands.action.repeat')}
          </label>
          {action.repeat_minutes > 0 ? (
            <div className="mt-1.5">
              <label className="mb-1 block text-xs text-slate-400">{t('commands.schedule.every')}</label>
              <IntervalPicker minutes={action.repeat_minutes} onChange={(repeat_minutes) => update({ repeat_minutes } as Partial<FlowAction>)} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{t('commands.action.repeatHint')}</p>
          )}
        </div>
      )}

      <Handle type="target" position={Position.Left} className={style.handle} />
      <Handle type="source" position={Position.Right} className={style.handle} />
    </div>
  );
});
