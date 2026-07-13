import { useI18n } from '../../i18n.js';

const INPUT_CLASS =
  'nodrag w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm focus:border-blue-400/50 focus:outline-none';

// Minutes shown as the largest unit that divides them evenly, so "1440" reads
// as "1 day" and editing keeps the chosen unit.
export function intervalParts(minutes: number): { value: number; unit: 'minutes' | 'hours' | 'days' } {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'days' };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' };
  return { value: minutes, unit: 'minutes' };
}
const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;

/** Value + unit editor for an every-N-minutes interval (5 min – 7 days). */
export function IntervalPicker({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const { t } = useI18n();
  const { value, unit } = intervalParts(minutes);

  const set = (v: number, u: 'minutes' | 'hours' | 'days') => {
    // Clamp to the schema's 5 min – 7 days window.
    onChange(Math.min(10080, Math.max(5, Math.round(v) * UNIT_MINUTES[u])));
  };

  return (
    <div className="flex gap-1.5">
      <input
        type="number"
        min={1}
        className={`${INPUT_CLASS} w-20`}
        value={value}
        onChange={(e) => set(Math.max(1, Number(e.target.value) || 1), unit)}
      />
      <select className={INPUT_CLASS} value={unit} onChange={(e) => set(value, e.target.value as 'minutes' | 'hours' | 'days')}>
        <option value="minutes">{t('commands.schedule.minutes')}</option>
        <option value="hours">{t('commands.schedule.hours')}</option>
        <option value="days">{t('commands.schedule.days')}</option>
      </select>
    </div>
  );
}
