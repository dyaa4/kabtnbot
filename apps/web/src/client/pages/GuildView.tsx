import { useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft, LayoutDashboard, Mic, Sparkles, Zap, Shield, Hand, BarChart3, FileText, Palette, Settings,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
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
  const location = useLocation();
  if (!guildId) return null;

  // The automation editor is a full-viewport canvas, so this route widens the
  // whole page (Layout drops its max-w-4xl). No negative-margin bleed — that
  // was direction-unsafe and drifted the sidebar in RTL. A plain wide column
  // lets flex-row place the tab sidebar correctly (right in RTL, left in LTR).
  const isEditorTab = location.pathname.endsWith('/commands');

  // Collapsible feature sidebar: full (icon + label) by default, or icon-only
  // when collapsed. The choice is remembered across visits. Collapse is a
  // desktop concept — on mobile the sidebar is a horizontal strip with labels.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dash-sidebar-collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('dash-sidebar-collapsed', next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });

  const tabs = [
    { to: '', key: 'tabs.overview', Icon: LayoutDashboard },
    { to: 'voice', key: 'tabs.voice', Icon: Mic },
    { to: 'channels', key: 'tabs.channels', Icon: Sparkles },
    { to: 'commands', key: 'tabs.commands', Icon: Zap },
    { to: 'protection', key: 'tabs.protection', Icon: Shield },
    { to: 'welcome', key: 'tabs.welcome', Icon: Hand },
    { to: 'stats', key: 'tabs.stats', Icon: BarChart3 },
    { to: 'logs', key: 'tabs.logs', Icon: FileText },
    { to: 'customize', key: 'tabs.customize', Icon: Palette },
    { to: 'settings', key: 'tabs.settings', Icon: Settings },
  ];

  return (
    <Layout wide={isEditorTab}>
      {/* The dashboard had no direct way back to the server list — only an
          indirect brand → landing → dashboard hop. This is the explicit return. */}
      <Link
        to="/app"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-blue-300"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('nav.backToServers')}
      </Link>
      {/* Tabs as a sidebar on desktop; a horizontal scroll strip on mobile.
          items-start so the sidebar keeps its natural height and isn't stretched
          to a tall tab body (e.g. the full-viewport automation editor). */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        {/* On desktop the sidebar sticks so it stays visible while a tab scrolls.
            Width shrinks to an icon rail when collapsed. Sits on the correct
            side automatically (right in RTL, left in LTR) via flex-row + dir. */}
        <nav
          className={`flex gap-2 overflow-x-auto pb-1 md:sticky md:top-24 md:shrink-0 md:flex-col md:gap-1 md:overflow-visible md:pb-0 ${
            collapsed ? 'md:w-14' : 'md:w-48'
          }`}
        >
          {/* Collapse toggle — desktop only (mobile is a scroll strip). The icon
              mirrors in RTL so it always points "outward" toward the edge. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className={`hidden rounded-xl px-4 py-2 text-slate-400 transition hover:bg-white/5 hover:text-slate-200 md:mb-1 md:flex md:items-center ${
              collapsed ? 'md:justify-center md:px-0' : 'md:justify-end'
            }`}
          >
            {collapsed
              ? <PanelLeftOpen className="h-5 w-5 rtl:-scale-x-100" />
              : <PanelLeftClose className="h-5 w-5 rtl:-scale-x-100" />}
          </button>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === ''}
              title={collapsed ? t(tab.key) : undefined}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition md:w-full ${
                  collapsed ? 'md:justify-center md:px-0' : ''
                } ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500 via-blue-500 to-blue-400 text-slate-950 shadow-[0_0_20px_-6px_rgba(59,130,246,0.7)]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <tab.Icon className="h-4 w-4 shrink-0" />
              <span className={collapsed ? 'md:hidden' : ''}>{t(tab.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
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
        </div>
      </div>
    </Layout>
  );
}
