import type { CommandFlow } from '@gamebot/shared';
import { intervalParts } from './IntervalPicker.js';

/**
 * One-line, localized "when → what" description of a flow, so the sidebar
 * reads like a sentence instead of bare names. The arrow itself is a locale
 * string (RTL languages point it the other way).
 */
export function flowSummary(flow: CommandFlow, t: (key: string) => string): string {
  const when: string[] = [];
  if (flow.triggers[0]) when.push(`«${flow.triggers[0]}»`);
  if (flow.schedule.enabled) {
    if (flow.schedule.mode === 'daily') {
      when.push(t('commands.summary.daily').replace('{time}', flow.schedule.at));
    } else {
      const { value, unit } = intervalParts(flow.schedule.every_minutes);
      when.push(t('commands.summary.every').replace('{interval}', `${value} ${t(`commands.schedule.${unit}`)}`));
    }
  }
  const names = flow.actions.map((a) => t(`commands.action.${a.type}`));
  const what = names.slice(0, 2).join(' + ') + (names.length > 2 ? ` +${names.length - 2}` : '');
  if (when.length === 0) return what;
  return `${when.join(' / ')} ${t('commands.summary.then')} ${what}`;
}
