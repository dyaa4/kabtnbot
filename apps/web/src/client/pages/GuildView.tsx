import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';
import { Overview } from '../components/Overview.js';
import { ProtectionTab } from '../components/ProtectionTab.js';
import { SettingsTab } from '../components/SettingsTab.js';
import { StatsTab } from '../components/StatsTab.js';

export function GuildView() {
  const { t } = useI18n();
  const { guildId } = useParams<{ guildId: string }>();
  if (!guildId) return null;

  const tabs = [
    { to: '', key: 'tabs.overview' },
    { to: 'settings', key: 'tabs.settings' },
    { to: 'protection', key: 'tabs.protection' },
    { to: 'stats', key: 'tabs.stats' },
  ];

  return (
    <Layout>
      <nav className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === ''}
            className={({ isActive }) =>
              `rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 text-slate-950 shadow-[0_0_20px_-6px_rgba(99,102,241,0.7)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`
            }
          >
            {t(tab.key)}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview guildId={guildId} />} />
        <Route path="settings" element={<SettingsTab guildId={guildId} />} />
        <Route path="protection" element={<ProtectionTab guildId={guildId} />} />
        <Route path="stats" element={<StatsTab guildId={guildId} />} />
      </Routes>
    </Layout>
  );
}
