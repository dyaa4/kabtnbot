import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/config-cache.js', () => ({ getCachedGuildConfig: vi.fn() }));
vi.mock('../voice-ai/sessions.js', () => ({ playSpeech: vi.fn(async () => {}) }));

import { getCachedGuildConfig } from '../../lib/config-cache.js';
import {
  resolveModerationChannel,
  handleTranscriptModeration,
  resetModerationState,
  nextStrike,
} from './voice-mod.js';

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

describe('nextStrike — warn/kick/cooldown transitions', () => {
  it('warns on the first strike, kicks on the second within the window', () => {
    const first = nextStrike(undefined, 1_000);
    expect(first.action).toBe('warn');
    expect(first.state.count).toBe(1);
    const second = nextStrike(first.state, 1_000 + 20_000);
    expect(second.action).toBe('kick');
    expect(second.state.count).toBe(2);
  });

  it('swallows a repeat within the cooldown (anti-loop)', () => {
    const first = nextStrike(undefined, 1_000);
    const dupe = nextStrike(first.state, 1_000 + 2_000); // 2s later, < cooldown
    expect(dupe.action).toBe('cooldown');
    expect(dupe.state.count).toBe(1); // count does not advance
  });

  it('resets the count once the window has elapsed', () => {
    const first = nextStrike(undefined, 0);
    const stale = nextStrike(first.state, 6 * 60_000); // > 5min window
    expect(stale.action).toBe('warn');
    expect(stale.state.count).toBe(1);
  });
});

describe('handleTranscriptModeration — warn then kick', () => {
  const enabled = {
    protection: { enabled: true, voice_moderation: true, custom_words: ['بادوورد'], log_channel_id: null },
    language: 'ar',
  };

  function guildWithMember(disconnect: () => Promise<void>, send: (c: string) => Promise<void>) {
    return {
      id: 'g',
      members: { cache: new Map([['u', { displayName: 'زيد', voice: { disconnect } }]]) },
      channels: { cache: new Map([['c', { isTextBased: () => true, send }]]) },
      systemChannel: null,
    } as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetModerationState();
  });

  it('WARNS on the first profane word — no kick', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue(enabled as never);
    const disconnect = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const acted = await handleTranscriptModeration(guildWithMember(disconnect, send), {} as never, 'u', 'انت بادوورد يا رجل', 1_000);
    expect(acted).toBe(true);
    expect(disconnect).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toContain('تحذير');
    expect(send.mock.calls[0][0]).not.toContain('تم إخراج');
  });

  it('KICKS on a repeat offense past the cooldown', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue(enabled as never);
    const disconnect = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const guild = guildWithMember(disconnect, send);
    await handleTranscriptModeration(guild, {} as never, 'u', 'انت بادوورد', 1_000); // warn
    const acted = await handleTranscriptModeration(guild, {} as never, 'u', 'انت بادوورد', 1_000 + 20_000); // kick
    expect(acted).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(expect.stringContaining('تم إخراج'));
  });

  it('does NOT re-act to a duplicate transcript inside the cooldown (anti-loop)', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue(enabled as never);
    const disconnect = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const guild = guildWithMember(disconnect, send);
    await handleTranscriptModeration(guild, {} as never, 'u', 'انت بادوورد', 1_000); // warn
    const acted = await handleTranscriptModeration(guild, {} as never, 'u', 'انت بادوورد', 1_000 + 2_000); // dupe
    expect(acted).toBe(true);
    expect(disconnect).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1); // only the first warning went out
  });

  it('on a repeat offense where the kick fails, posts a failure notice not a false success', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue(enabled as never);
    const disconnect = vi.fn(async () => {
      throw new Error('Missing Permissions');
    });
    const send = vi.fn(async () => {});
    const guild = guildWithMember(disconnect, send);
    await handleTranscriptModeration(guild, {} as never, 'u', 'انت بادوورد', 1_000); // warn
    const acted = await handleTranscriptModeration(guild, {} as never, 'u', 'انت بادوورد', 1_000 + 20_000); // kick attempt
    expect(acted).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(expect.stringContaining('تعذّر إخراجه'));
    expect(send.mock.calls.at(-1)?.[0]).not.toContain('تم إخراج');
  });

  it('KICKS on the first word when voice_kick_immediately is on', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue({
      protection: { enabled: true, voice_moderation: true, voice_kick_immediately: true, custom_words: ['بادوورد'], log_channel_id: null },
      language: 'ar',
    } as never);
    const disconnect = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const acted = await handleTranscriptModeration(guildWithMember(disconnect, send), {} as never, 'u', 'انت بادوورد', 1_000);
    expect(acted).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(expect.stringContaining('تم إخراج'));
  });

  it('immediate mode still swallows a duplicate inside the cooldown (no loop)', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue({
      protection: { enabled: true, voice_moderation: true, voice_kick_immediately: true, custom_words: ['بادوورد'], log_channel_id: null },
      language: 'ar',
    } as never);
    const disconnect = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const guild = guildWithMember(disconnect, send);
    await handleTranscriptModeration(guild, {} as never, 'u', 'انت بادوورد', 1_000); // kick
    await handleTranscriptModeration(guild, {} as never, 'u', 'انت بادوورد', 1_000 + 2_000); // dupe within cooldown
    expect(disconnect).toHaveBeenCalledTimes(1); // not twice
  });

  it('does nothing for clean speech', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue(enabled as never);
    const disconnect = vi.fn(async () => {});
    const acted = await handleTranscriptModeration(guildWithMember(disconnect, async () => {}), {} as never, 'u', 'مرحبا يا شباب', 1_000);
    expect(acted).toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('does nothing when protection is disabled', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue({
      protection: { enabled: false, voice_moderation: true, custom_words: ['بادوورد'], log_channel_id: null },
      language: 'ar',
    } as never);
    const disconnect = vi.fn(async () => {});
    const acted = await handleTranscriptModeration(guildWithMember(disconnect, async () => {}), {} as never, 'u', 'انت بادوورد', 1_000);
    expect(acted).toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
  });
});
