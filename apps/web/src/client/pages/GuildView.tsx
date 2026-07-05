import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';
import { Overview } from '../components/Overview.js';
import { SettingsTab } from '../components/SettingsTab.js';
import { LeaderboardTab } from '../components/LeaderboardTab.js';
import { MatchesTab } from '../components/MatchesTab.js';

export function GuildView() {
  const { t } = useI18n();
  const { guildId } = useParams<{ guildId: string }>();
  if (!guildId) return null;

  const tabs = [
    { to: '', key: 'tabs.overview' },
    { to: 'settings', key: 'tabs.settings' },
    { to: 'leaderboard', key: 'tabs.leaderboard' },
    { to: 'matches', key: 'tabs.matches' },
  ];

  return (
    <Layout>
      <nav className="mb-6 flex gap-2 border-b border-slate-800">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === ''}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-semibold ${isActive ? 'border-b-2 border-indigo-500 text-indigo-300' : 'text-slate-400'}`
            }
          >
            {t(tab.key)}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview guildId={guildId} />} />
        <Route path="settings" element={<SettingsTab guildId={guildId} />} />
        <Route path="leaderboard" element={<LeaderboardTab guildId={guildId} />} />
        <Route path="matches" element={<MatchesTab guildId={guildId} />} />
      </Routes>
    </Layout>
  );
}
