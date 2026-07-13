import type { GuildCommandFlows, SlashCommandKey, SlashOverride } from '@gamebot/shared';
import { useI18n } from '../../i18n.js';
import { MultiSelect, useRoles } from './pickers.js';
import { UserSearchSelect } from './UserSearchSelect.js';

const DEFAULT_OVERRIDE: SlashOverride = { enabled: true, role_ids: [], user_ids: [] };

/**
 * Settings card for one Discord slash command: per-guild enable/disable and
 * role/user allowlists. Enforced bot-side in the interaction handler; guild
 * admins always bypass so /settings can't lock the admins out.
 */
export function SlashCommandPanel({
  guildId,
  draft,
  cmd,
  onChange,
}: {
  guildId: string;
  draft: GuildCommandFlows;
  cmd: SlashCommandKey;
  onChange: (next: GuildCommandFlows) => void;
}) {
  const { t } = useI18n();
  const roles = useRoles(guildId);
  // Optional chain: cached responses from before this field existed.
  const override = draft.slash_overrides?.[cmd] ?? DEFAULT_OVERRIDE;

  const patch = (p: Partial<SlashOverride>) =>
    onChange({
      ...draft,
      slash_overrides: { ...(draft.slash_overrides ?? {}), [cmd]: { ...override, ...p } },
    });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <span className="font-mono text-lg font-semibold text-blue-300">/{cmd}</span>
        <label className="ms-auto flex items-center gap-1.5 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={override.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          {t('commands.enabled')}
        </label>
      </div>
      <p className="mb-5 text-sm text-slate-400">{t(`commands.slash.desc.${cmd}`)}</p>

      <div className="grid max-w-xl gap-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">{t('commands.condition.roles')}</label>
          <MultiSelect
            options={roles.data ?? []}
            values={override.role_ids}
            onChange={(role_ids) => patch({ role_ids })}
            prefix="@"
            placeholder={t('commands.condition.roles')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">{t('commands.condition.users')}</label>
          <UserSearchSelect
            guildId={guildId}
            values={override.user_ids}
            onChange={(user_ids) => patch({ user_ids })}
          />
        </div>
        <p className="text-xs text-slate-500">{t('commands.slash.hint')}</p>
      </div>
    </div>
  );
}
