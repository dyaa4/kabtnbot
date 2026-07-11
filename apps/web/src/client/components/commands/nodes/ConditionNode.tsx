import { Handle, Position } from '@xyflow/react';
import { useI18n } from '../../../i18n.js';
import { MultiSelect, MultiChannelSelect, useRoles } from '../pickers.js';
import { UserSearchSelect } from '../UserSearchSelect.js';

export interface ConditionNodeData {
  guildId: string;
  roleIds: string[];
  userIds: string[];
  /** undefined = channel condition not available (built-ins). */
  channelIds?: string[];
  onChange: (patch: { role_ids?: string[]; user_ids?: string[]; channel_ids?: string[] }) => void;
  [key: string]: unknown;
}

export function ConditionNode({ data }: { data: ConditionNodeData }) {
  const { t } = useI18n();
  const roles = useRoles(data.guildId);

  return (
    <div className="w-72 rounded-2xl border border-violet-400/30 bg-slate-900/90 p-4 shadow-[0_0_24px_-8px_rgba(139,92,246,0.5)] backdrop-blur-md">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-violet-300">
        <span>🛡️</span>
        {t('commands.condition.title')}
      </div>
      <p className="mb-3 text-xs text-slate-500">{t('commands.condition.hint')}</p>

      <label className="mb-1 block text-xs text-slate-400">{t('commands.condition.roles')}</label>
      <MultiSelect
        options={roles.data ?? []}
        values={data.roleIds}
        onChange={(role_ids) => data.onChange({ role_ids })}
        prefix="@"
        placeholder={t('commands.condition.roles')}
      />

      <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.condition.users')}</label>
      <UserSearchSelect
        guildId={data.guildId}
        values={data.userIds}
        onChange={(user_ids) => data.onChange({ user_ids })}
      />

      {data.channelIds !== undefined && (
        <>
          <label className="mb-1 mt-3 block text-xs text-slate-400">{t('commands.condition.channels')}</label>
          <MultiChannelSelect
            guildId={data.guildId}
            values={data.channelIds}
            onChange={(channel_ids) => data.onChange({ channel_ids })}
          />
        </>
      )}

      <Handle type="target" position={Position.Left} className="!bg-violet-400" />
      <Handle type="source" position={Position.Right} className="!bg-violet-400" />
    </div>
  );
}
