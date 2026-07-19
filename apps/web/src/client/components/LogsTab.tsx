import { useState } from 'react';
import { Gem } from 'lucide-react';
import { useI18n } from '../i18n.js';
import { VoiceLogTab } from './VoiceLogTab.js';
import { ChatLogTab } from './ChatLogTab.js';

type View = 'voice' | 'chat';

/**
 * Merged premium logs tab: a segmented toggle switches between the voice and
 * chat logs. Only the selected view is mounted, so switching fetches just that
 * log — the Pro gate and heading live here once instead of twice.
 */
export function LogsTab({ guildId }: { guildId: string }) {
  const { t } = useI18n();
  const [view, setView] = useState<View>('voice');

  const seg = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
        view === v
          ? 'bg-gradient-to-r from-blue-500 via-blue-500 to-blue-400 text-slate-950 shadow-[0_0_20px_-6px_rgba(59,130,246,0.7)]'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">
          {t('tabs.logs')}
          <span className="ms-2 rounded-full bg-blue-400/15 px-2 py-0.5 align-middle text-xs font-semibold text-blue-300">
            <Gem className="inline h-3 w-3 align-[-1px]" /> Pro
          </span>
        </h2>
        <div className="ms-auto flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
          {seg('voice', t('tabs.voiceLog'))}
          {seg('chat', t('tabs.chatLog'))}
        </div>
      </div>
      {view === 'voice' ? <VoiceLogTab guildId={guildId} /> : <ChatLogTab guildId={guildId} />}
    </div>
  );
}
