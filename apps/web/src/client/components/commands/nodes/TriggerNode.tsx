import { Clock, Mic } from 'lucide-react';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { CommandFlow, FlowSchedule } from '@gamebot/shared';
import { useI18n } from '../../../i18n.js';
import { useCanvas } from '../FlowCanvas.js';
import { IntervalPicker } from '../IntervalPicker.js';
import { useTextChannels } from '../pickers.js';

const INPUT_CLASS =
  'nodrag w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm focus:border-blue-400/50 focus:outline-none';

function PhraseChips({
  phrases,
  onChange,
  placeholder,
  min = 1,
}: {
  phrases: string[];
  onChange: (p: string[]) => void;
  placeholder: string;
  min?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !phrases.includes(v) && phrases.length < 20) {
      onChange([...phrases, v]);
      setDraft('');
    }
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {phrases.map((p) => (
          <button
            key={p}
            type="button"
            className="nodrag rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-xs text-blue-200 hover:border-blue-400/60 hover:text-blue-100"
            onClick={() => phrases.length > min && onChange(phrases.filter((x) => x !== p))}
          >
            {p} ×
          </button>
        ))}
      </div>
      <input
        className={`${INPUT_CLASS} mt-1.5`}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

function ScheduleSection({
  guildId,
  schedule,
  onChange,
}: {
  guildId: string;
  schedule: FlowSchedule;
  onChange: (s: FlowSchedule) => void;
}) {
  const { t } = useI18n();
  const channels = useTextChannels(guildId);

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <label className="flex items-center gap-1.5 text-sm font-semibold text-blue-300">
        <input
          type="checkbox"
          className="nodrag"
          checked={schedule.enabled}
          onChange={(e) => onChange({ ...schedule, enabled: e.target.checked })}
        />
        <Clock className="h-3.5 w-3.5" /> {t('commands.schedule.title')}
      </label>
      <p className="mt-1 text-xs text-slate-500">{t('commands.schedule.hint')}</p>
      {schedule.enabled && (
        <>
          <label className="mb-1 mt-2 block text-xs text-slate-400">{t('commands.schedule.mode')}</label>
          <select
            className={INPUT_CLASS}
            value={schedule.mode}
            onChange={(e) => onChange({ ...schedule, mode: e.target.value as FlowSchedule['mode'] })}
          >
            <option value="every">{t('commands.schedule.mode.every')}</option>
            <option value="daily">{t('commands.schedule.mode.daily')}</option>
          </select>
          {schedule.mode === 'every' ? (
            <>
              <label className="mb-1 mt-2 block text-xs text-slate-400">{t('commands.schedule.every')}</label>
              <IntervalPicker minutes={schedule.every_minutes} onChange={(every_minutes) => onChange({ ...schedule, every_minutes })} />
            </>
          ) : (
            <>
              <label className="mb-1 mt-2 block text-xs text-slate-400">{t('commands.schedule.at')}</label>
              <input
                type="time"
                className={INPUT_CLASS}
                value={schedule.at}
                onChange={(e) =>
                  e.target.value &&
                  // Stamp the editor's UTC offset alongside the wall-clock time —
                  // getTimezoneOffset() is minutes WEST of UTC, the schema wants EAST.
                  onChange({ ...schedule, at: e.target.value, tz_offset_minutes: -new Date().getTimezoneOffset() })
                }
              />
              <p className="mt-1 text-xs text-slate-500">{t('commands.schedule.atHint')}</p>
            </>
          )}
          <label className="mb-1 mt-2 block text-xs text-slate-400">{t('commands.schedule.maxRuns')}</label>
          <input
            type="number"
            min={0}
            max={1000}
            className={INPUT_CLASS}
            value={schedule.max_runs}
            onChange={(e) => onChange({ ...schedule, max_runs: Math.min(1000, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
          />
          <p className="mt-1 text-xs text-slate-500">{t('commands.schedule.maxRunsHint')}</p>
          <label className="mb-1 mt-2 block text-xs text-slate-400">{t('commands.schedule.channel')}</label>
          <select
            className={INPUT_CLASS}
            value={schedule.channel_id}
            onChange={(e) => onChange({ ...schedule, channel_id: e.target.value })}
          >
            <option value="">—</option>
            {channels.data?.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
            {schedule.channel_id && !channels.data?.some((c) => c.id === schedule.channel_id) && (
              <option value={schedule.channel_id}>{schedule.channel_id}</option>
            )}
          </select>
        </>
      )}
    </div>
  );
}

export const TriggerNode = memo(function TriggerNode() {
  const { t } = useI18n();
  const { guildId, flow, change, builtin } = useCanvas();
  const hasPhrases = (flow?.triggers.length ?? 0) > 0;

  return (
    <div className="w-72 rounded-2xl border border-blue-400/30 bg-slate-900 p-4 shadow-[0_0_24px_-8px_rgba(59,130,246,0.5)]">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-blue-300">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-400/20 text-[11px] font-bold">1</span>
        <Mic className="h-4 w-4 shrink-0" />
        {t('commands.trigger.title')}
      </div>
      <p className="mb-3 text-xs text-slate-500">{t('commands.trigger.sub')}</p>

      {builtin || !flow ? (
        <>
          <p className="mb-2 text-xs text-slate-500">{t('commands.trigger.builtinPhrases')}</p>
          <span className="mb-3 block text-sm text-slate-400">{t('commands.builtin.hint')}</span>
          <label className="mb-1 block text-xs text-slate-400">{t('commands.trigger.extraPhrases')}</label>
          <PhraseChips
            phrases={builtin?.override.extra_triggers ?? []}
            onChange={(extra_triggers) => builtin?.onChange({ ...builtin.override, extra_triggers })}
            placeholder={t('commands.trigger.addPhrase')}
            min={0}
          />
        </>
      ) : (
        <>
          <label className="mb-1 block text-xs text-slate-400">{t('commands.trigger.phrases')}</label>
          <PhraseChips
            phrases={flow.triggers}
            onChange={(triggers) => change({ triggers })}
            placeholder={t('commands.trigger.addPhrase')}
            min={0}
          />

          {/* Phrase-only knobs are noise while a flow has no phrases (pure schedule). */}
          {hasPhrases && (
            <>
              <div className="mt-3 flex gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="nodrag"
                    checked={flow.sources.voice}
                    onChange={(e) => change({ sources: { ...flow.sources, voice: e.target.checked } })}
                  />
                  {t('commands.trigger.voice')}
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="nodrag"
                    checked={flow.sources.text}
                    onChange={(e) => change({ sources: { ...flow.sources, text: e.target.checked } })}
                  />
                  {t('commands.trigger.text')}
                </label>
              </div>
              {flow.sources.voice && <p className="mt-1 text-xs text-slate-500">{t('commands.voiceTriggerHint')}</p>}
              {flow.sources.text && <p className="mt-1 text-xs text-blue-400/80">{t('commands.textIntentHint')}</p>}

              <label className="mt-3 block text-xs text-slate-400">{t('commands.trigger.matchMode')}</label>
              <select
                className={INPUT_CLASS}
                value={flow.match_mode}
                onChange={(e) => change({ match_mode: e.target.value as CommandFlow['match_mode'] })}
              >
                <option value="exact">{t('commands.trigger.exact')}</option>
                <option value="prefix">{t('commands.trigger.prefix')}</option>
              </select>

              <label className="mt-3 flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="nodrag"
                  checked={flow.llm_fallback}
                  onChange={(e) => change({ llm_fallback: e.target.checked })}
                />
                {t('commands.trigger.llm')}
              </label>

              <label className="mt-3 block text-xs text-slate-400">{t('commands.trigger.cooldown')}</label>
              <input
                type="number"
                min={0}
                max={3600}
                className={INPUT_CLASS}
                value={flow.cooldown_seconds}
                onChange={(e) => change({ cooldown_seconds: Math.max(0, Number(e.target.value) || 0) })}
              />
            </>
          )}

          <ScheduleSection
            guildId={guildId}
            schedule={flow.schedule}
            onChange={(schedule) => change({ schedule })}
          />
        </>
      )}

      <Handle type="source" position={Position.Right} className="!bg-blue-400" />
    </div>
  );
});
