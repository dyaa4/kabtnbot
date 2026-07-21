import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';
import { Overview } from '../components/Overview.js';
import { ProtectionTab } from '../components/ProtectionTab.js';
import { CommandsTab } from '../components/commands/CommandsTab.js';
import { SettingsTab } from '../components/SettingsTab.js';
import { StatsTab } from '../components/StatsTab.js';
import { VoiceTab } from '../components/VoiceTab.js';
import { ChannelsTab } from '../components/ChannelsTab.js';
import { LogsTab } from '../components/LogsTab.js';
import { WelcomeTab } from '../components/WelcomeTab.js';
import { CustomizeTab } from '../components/CustomizeTab.js';

export function GuildView() {
  const { t } = useI18n();
  const { guildId } = useParams<{ guildId: string }>();
  if (!guildId) return null;

  const tabs = [
    { to: '', key: 'tabs.overview' },
    { to: 'voice', key: 'tabs.voice' },
    { to: 'channels', key: 'tabs.channels' },
    { to: 'commands', key: 'tabs.commands' },
    { to: 'protection', key: 'tabs.protection' },
    { to: 'welcome', key: 'tabs.welcome' },
    { to: 'stats', key: 'tabs.stats' },
    { to: 'logs', key: 'tabs.logs' },
    { to: 'customize', key: 'tabs.customize' },
    { to: 'settings', key: 'tabs.settings' },
  ];

  return (
    <Layout>
      {/* The dashboard had no direct way back to the server list — only an
          indirect brand → landing → dashboard hop. This is the explicit return. */}
      <Link
        to="/app"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-blue-300"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('nav.backToServers')}
      </Link>
      <nav className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === ''}
            className={({ isActive }) =>
              `rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-gradient-to-r from-blue-500 via-blue-500 to-blue-400 text-slate-950 shadow-[0_0_20px_-6px_rgba(59,130,246,0.7)]'
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
        <Route path="voice" element={<VoiceTab guildId={guildId} />} />
        <Route path="channels" element={<ChannelsTab guildId={guildId} />} />
        <Route path="settings" element={<SettingsTab guildId={guildId} />} />
        <Route path="customize" element={<CustomizeTab guildId={guildId} />} />
        <Route path="commands" element={<CommandsTab guildId={guildId} />} />
        <Route path="protection" element={<ProtectionTab guildId={guildId} />} />
        <Route path="welcome" element={<WelcomeTab guildId={guildId} />} />
        <Route path="stats" element={<StatsTab guildId={guildId} />} />
        <Route path="logs" element={<LogsTab guildId={guildId} />} />
        {/* Redirect the old split-log paths so any saved links still land. */}
        <Route path="voice-log" element={<Navigate to="../logs" replace />} />
        <Route path="chat-log" element={<Navigate to="../logs" replace />} />
      </Routes>
    </Layout>
  );
}
