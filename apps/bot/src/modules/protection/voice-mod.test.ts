import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/config-cache.js', () => ({ getCachedGuildConfig: vi.fn() }));
vi.mock('../voice-ai/sessions.js', () => ({ playSpeech: vi.fn(async () => {}) }));

import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { resolveModerationChannel, handleTranscriptModeration } from './voice-mod.js';

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

describe('handleTranscriptModeration — immediate kick', () => {
  const enabled = {
    protection: { enabled: true, voice_moderation: true, custom_words: ['بادوورد'], log_channel_id: null },
  };

  function guildWithMember(disconnect: () => Promise<void>, send: (c: string) => Promise<void>) {
    return {
      id: 'g',
      members: { cache: new Map([['u', { displayName: 'زيد', voice: { disconnect } }]]) },
      channels: { cache: new Map([['c', { isTextBased: () => true, send }]]) },
      systemChannel: null,
    } as never;
  }

  beforeEach(() => vi.clearAllMocks());

  it('kicks on the FIRST profane word and posts a text notice', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue(enabled as never);
    const disconnect = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const acted = await handleTranscriptModeration(guildWithMember(disconnect, send), {} as never, 'u', 'انت بادوورد يا رجل');
    expect(acted).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does nothing for clean speech', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue(enabled as never);
    const disconnect = vi.fn(async () => {});
    const acted = await handleTranscriptModeration(guildWithMember(disconnect, async () => {}), {} as never, 'u', 'مرحبا يا شباب');
    expect(acted).toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('does nothing when protection is disabled', async () => {
    vi.mocked(getCachedGuildConfig).mockResolvedValue({
      protection: { enabled: false, voice_moderation: true, custom_words: ['بادوورد'], log_channel_id: null },
    } as never);
    const disconnect = vi.fn(async () => {});
    const acted = await handleTranscriptModeration(guildWithMember(disconnect, async () => {}), {} as never, 'u', 'انت بادوورد');
    expect(acted).toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
  });
});
