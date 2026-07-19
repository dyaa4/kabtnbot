import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import { useI18n } from '../i18n.js';
import { Layout } from '../components/Layout.js';
import { Overview } from '../components/Overview.js';
import { ProtectionTab } from '../components/ProtectionTab.js';
import { CommandsTab } from '../components/commands/CommandsTab.js';
import { SettingsTab } from '../components/SettingsTab.js';
import { StatsTab } from '../components/StatsTab.js';
import { VoiceTab } from '../components/VoiceTab.js';
import { VoiceLogTab } from '../components/VoiceLogTab.js';
import { ChatLogTab } from '../components/ChatLogTab.js';
import { WelcomeTab } from '../components/WelcomeTab.js';
import { CustomizeTab } from '../components/CustomizeTab.js';

export function GuildView() {
  const { t } = useI18n();
  const { guildId } = useParams<{ guildId: string }>();
  if (!guildId) return null;

  const tabs = [
    { to: '', key: 'tabs.overview' },
    { to: 'voice', key: 'tabs.voice' },
    { to: 'commands', key: 'tabs.commands' },
    { to: 'protection', key: 'tabs.protection' },
    { to: 'welcome', key: 'tabs.welcome' },
    { to: 'stats', key: 'tabs.stats' },
    { to: 'voice-log', key: 'tabs.voiceLog' },
    { to: 'chat-log', key: 'tabs.chatLog' },
    { to: 'customize', key: 'tabs.customize' },
    { to: 'settings', key: 'tabs.settings' },
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
        <Route path="settings" element={<SettingsTab guildId={guildId} />} />
        <Route path="customize" element={<CustomizeTab guildId={guildId} />} />
        <Route path="commands" element={<CommandsTab guildId={guildId} />} />
        <Route path="protection" element={<ProtectionTab guildId={guildId} />} />
        <Route path="welcome" element={<WelcomeTab guildId={guildId} />} />
        <Route path="stats" element={<StatsTab guildId={guildId} />} />
        <Route path="voice-log" element={<VoiceLogTab guildId={guildId} />} />
        <Route path="chat-log" element={<ChatLogTab guildId={guildId} />} />
      </Routes>
    </Layout>
  );
}
