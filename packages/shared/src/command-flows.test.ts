import { describe, it, expect } from 'vitest';
import {
  CommandFlowSchema,
  GuildCommandFlowsSchema,
  matchCustomFlows,
  matchBuiltinExtraTriggers,
  isSpeakerAllowed,
  type CommandFlow,
} from './command-flows.js';

function flow(partial: Partial<CommandFlow> & { triggers: string[] }): CommandFlow {
  return CommandFlowSchema.parse({
    id: partial.id ?? 'f1',
    name: partial.name ?? 'Test',
    actions: partial.actions ?? [{ id: 'a1', type: 'speak_tts', text: 'ok' }],
    ...partial,
  });
}

describe('GuildCommandFlowsSchema', () => {
  it('parses empty input to defaults', () => {
    const parsed = GuildCommandFlowsSchema.parse({});
    expect(parsed.flows).toEqual([]);
    expect(parsed.builtin_overrides).toEqual({});
    expect(parsed.folders).toEqual([]);
  });

  it('round-trips a flow and fills defaults', () => {
    const parsed = GuildCommandFlowsSchema.parse({
      flows: [
        {
          id: 'x',
          name: 'Raus',
          triggers: ['geh raus jetzt'],
          actions: [{ id: 'a', type: 'voice_leave' }],
        },
      ],
    });
    const f = parsed.flows[0];
    expect(f.enabled).toBe(true);
    expect(f.sources).toEqual({ voice: true, text: false });
    expect(f.match_mode).toBe('exact');
    expect(f.llm_fallback).toBe(true);
    expect(f.cooldown_seconds).toBe(5);
    expect(f.conditions).toEqual({ role_ids: [], user_ids: [], channel_ids: [] });
    expect(f.layout.trigger).toEqual({ x: 0, y: 120 });
    expect(f.actions[0].pos).toEqual({ x: 0, y: 0 });
  });

  it('daily schedules parse with time+offset+run limit; bad times are rejected', () => {
    const withSchedule = (schedule: object) => ({
      id: 'x', name: 'S', triggers: [],
      schedule: { enabled: true, channel_id: 'c1', ...schedule },
      actions: [{ id: 'a', type: 'send_message', channel_id: 'c1', text: 'gm' }],
    });
    const parsed = CommandFlowSchema.parse(
      withSchedule({ mode: 'daily', at: '21:15', tz_offset_minutes: 180, max_runs: 3 }),
    );
    expect(parsed.schedule).toMatchObject({ mode: 'daily', at: '21:15', tz_offset_minutes: 180, max_runs: 3 });
    // Defaults keep old documents valid: interval mode, no run limit.
    const defaults = CommandFlowSchema.parse(withSchedule({}));
    expect(defaults.schedule).toMatchObject({ mode: 'every', max_runs: 0 });
    expect(() => CommandFlowSchema.parse(withSchedule({ mode: 'daily', at: '24:00' }))).toThrow();
    expect(() => CommandFlowSchema.parse(withSchedule({ mode: 'daily', at: '9:00' }))).toThrow(); // needs HH:MM
  });

  it('accepts a voice_join action; channel_id defaults to "" (= invoker channel)', () => {
    const parsed = CommandFlowSchema.parse({
      id: 'x', name: 'Join', triggers: ['تعال'],
      actions: [{ id: 'a', type: 'voice_join' }],
    });
    expect(parsed.actions[0]).toMatchObject({ type: 'voice_join', channel_id: '' });
  });

  it('accepts a send_voice_chat action (no channel pick) and rejects empty text', () => {
    const withText = (text: string) => ({
      id: 'x', name: 'VC', triggers: ['hi'],
      actions: [{ id: 'a', type: 'send_voice_chat', text }],
    });
    expect(CommandFlowSchema.parse(withText('yo')).actions[0].type).toBe('send_voice_chat');
    expect(() => CommandFlowSchema.parse(withText(''))).toThrow();
  });

  it('rejects a flow without triggers or actions', () => {
    expect(() =>
      GuildCommandFlowsSchema.parse({
        flows: [{ id: 'x', name: 'Bad', triggers: [], actions: [] }],
      }),
    ).toThrow();
  });

  it('accepts a schedule-only flow (no phrase triggers)', () => {
    const parsed = GuildCommandFlowsSchema.parse({
      flows: [
        {
          id: 'x',
          name: 'Daily post',
          triggers: [],
          schedule: { enabled: true, every_minutes: 1440, channel_id: 'c1' },
          actions: [{ id: 'a', type: 'send_message', channel_id: 'c1', text: 'gm' }],
        },
      ],
    });
    expect(parsed.flows[0].schedule).toEqual({
      enabled: true, mode: 'every', every_minutes: 1440,
      at: '20:00', tz_offset_minutes: 0, max_runs: 0, channel_id: 'c1',
    });
  });

  it('defaults schedule to disabled for existing flows', () => {
    const parsed = GuildCommandFlowsSchema.parse({
      flows: [{ id: 'x', name: 'Old', triggers: ['hi'], actions: [{ id: 'a', type: 'voice_leave' }] }],
    });
    expect(parsed.flows[0].schedule).toEqual({
      enabled: false, mode: 'every', every_minutes: 60,
      at: '20:00', tz_offset_minutes: 0, max_runs: 0, channel_id: '',
    });
  });

  it('rejects an enabled schedule without an output channel', () => {
    expect(() =>
      GuildCommandFlowsSchema.parse({
        flows: [
          {
            id: 'x',
            name: 'Bad',
            triggers: [],
            schedule: { enabled: true, every_minutes: 60, channel_id: '' },
            actions: [{ id: 'a', type: 'voice_leave' }],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects a flow with neither phrase triggers nor a schedule', () => {
    expect(() =>
      GuildCommandFlowsSchema.parse({
        flows: [{ id: 'x', name: 'Bad', triggers: [], actions: [{ id: 'a', type: 'voice_leave' }] }],
      }),
    ).toThrow();
  });

  it('defaults repeat_minutes to 0 (step follows the flow schedule)', () => {
    const parsed = CommandFlowSchema.parse({
      id: 'x', name: 'Old', triggers: ['hi'],
      actions: [{ id: 'a', type: 'voice_leave' }],
    });
    expect(parsed.actions[0].repeat_minutes).toBe(0);
  });

  it('accepts a per-action repeat interval within 1 min – 7 days, rejects outside', () => {
    const withRepeat = (repeat_minutes: number) => ({
      id: 'x', name: 'R', triggers: [],
      schedule: { enabled: true, every_minutes: 60, channel_id: 'c1' },
      actions: [{ id: 'a', type: 'send_message', channel_id: 'c1', text: 'hi', repeat_minutes }],
    });
    expect(CommandFlowSchema.parse(withRepeat(1)).actions[0].repeat_minutes).toBe(1);
    expect(CommandFlowSchema.parse(withRepeat(0)).actions[0].repeat_minutes).toBe(0); // = with the flow schedule
    expect(CommandFlowSchema.parse(withRepeat(10080)).actions[0].repeat_minutes).toBe(10080);
    expect(() => CommandFlowSchema.parse(withRepeat(-1))).toThrow();
    expect(() => CommandFlowSchema.parse(withRepeat(10081))).toThrow();
    expect(() => CommandFlowSchema.parse(withRepeat(20000))).toThrow();
  });

  it('dm_user may target picked members and/or roles instead of a single member', () => {
    const dm = (extra: object) => ({
      id: 'x', name: 'DM', triggers: ['hi'],
      actions: [{ id: 'a', type: 'dm_user', text: 'hey', target: 'member', ...extra }],
    });
    expect(CommandFlowSchema.parse(dm({ target_user_ids: ['u1', 'u2'] })).actions[0]).toMatchObject({
      target_user_ids: ['u1', 'u2'],
    });
    expect(CommandFlowSchema.parse(dm({ target_role_ids: ['r1'] })).actions[0]).toMatchObject({
      target_role_ids: ['r1'],
    });
    // nothing picked at all → invalid
    expect(() => CommandFlowSchema.parse(dm({}))).toThrow();
  });

  it("target 'member' requires a picked member id", () => {
    const dm = (extra: object) => ({
      id: 'x', name: 'DM', triggers: ['hi'],
      actions: [{ id: 'a', type: 'dm_user', text: 'hey', ...extra }],
    });
    expect(() => CommandFlowSchema.parse(dm({ target: 'member' }))).toThrow();
    const parsed = CommandFlowSchema.parse(dm({ target: 'member', target_user_id: 'u1' }));
    expect(parsed.actions[0]).toMatchObject({ target: 'member', target_user_id: 'u1' });
    // default stays backward-compatible: speaker with empty member id
    const legacy = CommandFlowSchema.parse(dm({}));
    expect(legacy.actions[0]).toMatchObject({ target: 'speaker', target_user_id: '' });
  });

  it('rejects unknown action types', () => {
    expect(() =>
      GuildCommandFlowsSchema.parse({
        flows: [
          { id: 'x', name: 'Bad', triggers: ['a'], actions: [{ id: 'a', type: 'explode' }] },
        ],
      }),
    ).toThrow();
  });
});

describe('matchCustomFlows', () => {
  it('matches an exact trigger', () => {
    const f = flow({ triggers: ['geh raus jetzt'] });
    expect(matchCustomFlows([f], 'geh raus jetzt', 'voice')?.flow.id).toBe('f1');
  });

  it('ignores trailing punctuation from STT', () => {
    const f = flow({ triggers: ['geh raus jetzt'] });
    expect(matchCustomFlows([f], 'Geh raus jetzt.', 'voice')?.flow.id).toBe('f1');
  });

  // Same normalizeText folding as the wake word — Whisper spelling variance
  // must not break triggers.
  it('folds Arabic diacritics / alef / ta-marbuta variants', () => {
    const f = flow({ triggers: ['أطلع من القناة'] });
    expect(matchCustomFlows([f], 'اطلع من القناه', 'voice')).not.toBeNull();
  });

  it('folds elongation (3+ repeats)', () => {
    const f = flow({ triggers: ['اسكت'] });
    expect(matchCustomFlows([f], 'اسكتتتت', 'voice')).not.toBeNull();
  });

  it('prefix mode captures args and needs a word boundary', () => {
    const f = flow({ triggers: ['begrüße'], match_mode: 'prefix' });
    expect(matchCustomFlows([f], 'begrüße Ahmad bitte', 'voice')?.args).toBe('ahmad bitte');
    expect(matchCustomFlows([f], 'begrüße', 'voice')?.args).toBe('');
    expect(matchCustomFlows([f], 'begrüßen wir', 'voice')).toBeNull();
  });

  it('respects enabled and source flags', () => {
    const off = flow({ triggers: ['x1'], enabled: false });
    expect(matchCustomFlows([off], 'x1', 'voice')).toBeNull();

    const voiceOnly = flow({ triggers: ['x2'] }); // sources default: voice only
    expect(matchCustomFlows([voiceOnly], 'x2', 'text')).toBeNull();
    expect(matchCustomFlows([voiceOnly], 'x2', 'voice')).not.toBeNull();
  });

  it('first matching flow in array order wins', () => {
    const a = flow({ id: 'a', triggers: ['hallo'] });
    const b = flow({ id: 'b', triggers: ['hallo'] });
    expect(matchCustomFlows([a, b], 'hallo', 'voice')?.flow.id).toBe('a');
  });
});

describe('matchBuiltinExtraTriggers', () => {
  it('returns null for empty overrides (built-ins unchanged)', () => {
    const parsed = GuildCommandFlowsSchema.parse({});
    expect(matchBuiltinExtraTriggers(parsed.builtin_overrides, 'leave')).toBeNull();
  });

  it('matches an extra trigger exactly for leave', () => {
    const parsed = GuildCommandFlowsSchema.parse({
      builtin_overrides: { leave: { extra_triggers: ['hau ab'] } },
    });
    expect(matchBuiltinExtraTriggers(parsed.builtin_overrides, 'hau ab')).toEqual({
      key: 'leave',
      args: '',
    });
    expect(matchBuiltinExtraTriggers(parsed.builtin_overrides, 'hau ab sofort')).toBeNull();
  });

  it('captures args for say/kick extra triggers', () => {
    const parsed = GuildCommandFlowsSchema.parse({
      builtin_overrides: { kick: { extra_triggers: ['schmeiß raus'] } },
    });
    expect(matchBuiltinExtraTriggers(parsed.builtin_overrides, 'schmeiß raus Ahmad')).toEqual({
      key: 'kick',
      args: 'ahmad',
    });
  });

  it('disabled override never matches', () => {
    const parsed = GuildCommandFlowsSchema.parse({
      builtin_overrides: { stop: { enabled: false, extra_triggers: ['psst'] } },
    });
    expect(matchBuiltinExtraTriggers(parsed.builtin_overrides, 'psst')).toBeNull();
  });
});

describe('isSpeakerAllowed', () => {
  it('empty lists allow everyone', () => {
    expect(isSpeakerAllowed({ role_ids: [], user_ids: [] }, 'u1', [])).toBe(true);
  });
  it('user allowlist', () => {
    const cond = { role_ids: [], user_ids: ['u1'] };
    expect(isSpeakerAllowed(cond, 'u1', [])).toBe(true);
    expect(isSpeakerAllowed(cond, 'u2', [])).toBe(false);
  });
  it('role allowlist', () => {
    const cond = { role_ids: ['r1'], user_ids: [] };
    expect(isSpeakerAllowed(cond, 'u1', ['r1', 'r2'])).toBe(true);
    expect(isSpeakerAllowed(cond, 'u1', ['r3'])).toBe(false);
  });
  it('user OR role wins', () => {
    const cond = { role_ids: ['r1'], user_ids: ['u9'] };
    expect(isSpeakerAllowed(cond, 'u9', [])).toBe(true);
    expect(isSpeakerAllowed(cond, 'u1', ['r1'])).toBe(true);
    expect(isSpeakerAllowed(cond, 'u1', [])).toBe(false);
  });
});
