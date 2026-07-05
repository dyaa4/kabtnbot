import { describe, it, expect } from 'vitest';
import { ProfanityTracker, resolveModerationChannel } from './voice-mod.js';

describe('ProfanityTracker', () => {
  it('warns first, kicks second within the hour, warns again after the window', () => {
    const t = new ProfanityTracker();
    const base = 1_000_000_000;
    expect(t.register('g', 'u', base)).toBe('warn');
    expect(t.register('g', 'u', base + 5 * 60_000)).toBe('kick'); // 5 min later
    // > 1h after the FIRST → window reset → warn again
    expect(t.register('g', 'u', base + 61 * 60_000)).toBe('warn');
  });
  it('tracks users independently', () => {
    const t = new ProfanityTracker();
    expect(t.register('g', 'a', 0)).toBe('warn');
    expect(t.register('g', 'b', 0)).toBe('warn');
  });
});

function textChannel(id: string) {
  return { id, isTextBased: () => true };
}
function voiceChannel(id: string) {
  return { id, isTextBased: () => false };
}
function fakeGuild(opts: {
  channels: Array<ReturnType<typeof textChannel> | ReturnType<typeof voiceChannel>>;
  systemChannel?: ReturnType<typeof textChannel> | null;
}) {
  return {
    channels: { cache: new Map(opts.channels.map((c) => [c.id, c])) },
    systemChannel: opts.systemChannel ?? null,
  } as never;
}

describe('resolveModerationChannel', () => {
  it('prefers the configured log channel when it exists and is text-based', () => {
    const log = textChannel('log');
    const guild = fakeGuild({ channels: [voiceChannel('v'), log, textChannel('other')], systemChannel: textChannel('sys') });
    expect(resolveModerationChannel(guild, 'log')).toBe(log);
  });
  it('falls back to the system channel when no log channel is configured', () => {
    const sys = textChannel('sys');
    const guild = fakeGuild({ channels: [voiceChannel('v'), textChannel('t')], systemChannel: sys });
    expect(resolveModerationChannel(guild, null)).toBe(sys);
  });
  it('falls back to the first text channel when log id is invalid and no system channel', () => {
    const t = textChannel('t');
    const guild = fakeGuild({ channels: [voiceChannel('v'), t], systemChannel: null });
    expect(resolveModerationChannel(guild, 'does-not-exist')).toBe(t);
  });
  it('returns null when there is no usable text channel', () => {
    const guild = fakeGuild({ channels: [voiceChannel('v')], systemChannel: null });
    expect(resolveModerationChannel(guild, null)).toBeNull();
  });
});
