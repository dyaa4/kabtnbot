import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useI18n } from '../../../i18n.js';
import { useCanvas } from '../FlowCanvas.js';
import { MultiSelect, MultiChannelSelect, useRoles } from '../pickers.js';
import { UserSearchSelect } from '../UserSearchSelect.js';

export const ConditionNode = memo(function ConditionNode() {
  const { t } = useI18n();
  const { guildId, flow, change, builtin } = useCanvas();
  const roles = useRoles(guildId);

  const roleIds = flow?.conditions.role_ids ?? builtin?.override.role_ids ?? [];
  const userIds = flow?.conditions.user_ids ?? builtin?.override.user_ids ?? [];

  const patch = (p: { role_ids?: string[]; user_ids?: string[]; channel_ids?: string[] }) => {
    if (flow) change({ conditions: { ...flow.conditions, ...p } });
    else if (builtin) builtin.onChange({ ...builtin.override, ...p });
  };

  return (
    <div className="w-72 rounded-2xl border border-violet-400/30 bg-slate-900 p-4 shadow-[0_0_24px_-8px_rgba(139,92,246,0.5)]">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-violet-300">
        <span>🛡️</span>
        {t('commands.condition.title')}
      </div>
      <p className="mb-3 text-xs text-slate-500">{t('commands.condition.hint')}</p>

      <label className="mb-1 block text-xs text-slate-400">{t('commands.condition.roles')}</label>
      <MultiSelect
        options={roles.data ?? []}
        values={roleIds}
        onChange={(role_ids) => patch({ role_ids })}
        prefix="@"
        placeholder={t('commands.condition.roles')}
      />

      <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.condition.users')}</label>
      <UserSearchSelect guildId={guildId} values={userIds} onChange={(user_ids) => patch({ user_ids })} />

      {flow && (
        <>
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.condition.channels')}</label>
          <MultiChannelSelect
            guildId={guildId}
            values={flow.conditions.channel_ids}
            onChange={(channel_ids) => patch({ channel_ids })}
          />
        </>
      )}

      <Handle type="target" position={Position.Left} className="!bg-violet-400" />
      <Handle type="source" position={Position.Right} className="!bg-violet-400" />
    </div>
  );
});
