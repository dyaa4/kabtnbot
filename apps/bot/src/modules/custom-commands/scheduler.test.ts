import { describe, it, expect } from 'vitest';
import { CommandFlowSchema, type CommandFlow } from '@gamebot/shared';
import { partitionScheduled } from './scheduler.js';

function scheduledFlow(id: string, everyMinutes: number, extra: Partial<CommandFlow> = {}): CommandFlow {
  return CommandFlowSchema.parse({
    id,
    name: id,
    triggers: [],
    schedule: { enabled: true, every_minutes: everyMinutes, channel_id: 'c1' },
    actions: [{ id: 'a1', type: 'send_message', channel_id: 'c1', text: 'hi' }],
    ...extra,
  });
}

const NOW = new Date('2026-07-13T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe('partitionScheduled', () => {
  it('marks a never-seen scheduled flow as init, not due (no fire-on-save)', () => {
    const { due, init } = partitionScheduled([scheduledFlow('f1', 60)], new Map(), NOW);
    expect(due).toEqual([]);
    expect(init.map((u) => u.key)).toEqual(['f1']);
  });

  it('fires once the interval has elapsed, not before', () => {
    const flows = [scheduledFlow('early', 60), scheduledFlow('ready', 60)];
    const lastRuns = new Map([
      ['early', minutesAgo(30)],
      ['ready', minutesAgo(60)],
    ]);
    const { due, init } = partitionScheduled(flows, lastRuns, NOW);
    expect(due.map((u) => u.key)).toEqual(['ready']);
    expect(init).toEqual([]);
  });

  it('skips disabled flows and disabled schedules entirely', () => {
    const flows = [
      scheduledFlow('off', 5, { enabled: false }),
      CommandFlowSchema.parse({
        id: 'phrase-only', name: 'p', triggers: ['hi'],
        actions: [{ id: 'a1', type: 'voice_leave' }],
      }),
    ];
    const { due, init } = partitionScheduled(flows, new Map(), NOW);
    expect(due).toEqual([]);
    expect(init).toEqual([]);
  });

  it('an action with its own repeat interval becomes a separate unit on its own clock', () => {
    const flow = scheduledFlow('f1', 60, {
      actions: [
        { id: 'batch', type: 'send_message', channel_id: 'c1', text: 'hourly' },
        { id: 'fast', type: 'send_message', channel_id: 'c1', text: 'every 5', repeat_minutes: 5 },
      ],
    });
    const lastRuns = new Map([
      ['f1', minutesAgo(30)],       // base batch not due yet (60 min interval)
      ['f1:fast', minutesAgo(5)],   // own 5-min interval elapsed
    ]);
    const { due, init } = partitionScheduled([flow], lastRuns, NOW);
    expect(init).toEqual([]);
    expect(due.map((u) => u.key)).toEqual(['f1:fast']);
    expect(due[0].actions.map((a) => a.id)).toEqual(['fast']);
    expect(due[0].every_minutes).toBe(5);
  });

  it('a flow whose actions ALL have their own interval gets no base-batch unit', () => {
    const flow = scheduledFlow('f1', 60, {
      actions: [{ id: 'solo', type: 'send_message', channel_id: 'c1', text: 'x', repeat_minutes: 10 }],
    });
    const { due, init } = partitionScheduled([flow], new Map(), NOW);
    expect(due).toEqual([]);
    expect(init.map((u) => u.key)).toEqual(['f1:solo']);
  });
});
