import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { CommandFlow } from '@gamebot/shared';
import { useI18n } from '../../../i18n.js';
import { useCanvas } from '../FlowCanvas.js';

const INPUT_CLASS =
  'nodrag w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm focus:border-cyan-400/50 focus:outline-none';

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
            className="nodrag rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-200 hover:border-rose-400/50 hover:text-rose-300"
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

export const TriggerNode = memo(function TriggerNode() {
  const { t } = useI18n();
  const { flow, change, builtin } = useCanvas();

  return (
    <div className="w-72 rounded-2xl border border-cyan-400/30 bg-slate-900 p-4 shadow-[0_0_24px_-8px_rgba(34,211,238,0.5)]">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-cyan-300">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/20 text-[11px] font-bold">1</span>
        <span>🎙️</span>
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
          />

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
          {flow.sources.text && <p className="mt-1 text-xs text-amber-400/80">{t('commands.textIntentHint')}</p>}

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

      <Handle type="source" position={Position.Right} className="!bg-cyan-400" />
    </div>
  );
});
