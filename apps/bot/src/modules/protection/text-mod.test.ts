import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, updateGuildConfig } from '@gamebot/db';
import type { Client, Message } from 'discord.js';
import { shouldModerate, editNeedsRescan, logSnippet, moderateMessage, registerTextProtection } from './text-mod.js';
import { clearConfigCache } from '../../lib/config-cache.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

const cfg = (over: Partial<{ enabled: boolean; text: boolean }>) => ({
  protection: {
    enabled: over.enabled ?? true,
    text_protection: over.text ?? true,
    voice_moderation: true,
    custom_words: [],
    allowed_domains: [],
    log_channel_id: null,
  },
}) as never;

describe('shouldModerate', () => {
  it('only moderates non-admins when both toggles on', () => {
    expect(shouldModerate(cfg({}), false)).toBe(true);
    expect(shouldModerate(cfg({}), true)).toBe(false); // admins exempt
    expect(shouldModerate(cfg({ enabled: false }), false)).toBe(false);
    expect(shouldModerate(cfg({ text: false }), false)).toBe(false);
  });
});

describe('editNeedsRescan', () => {
  it('skips unchanged content, rescans changed or unknown-old content', () => {
    expect(editNeedsRescan('same', 'same')).toBe(false); // embed-only update
    expect(editNeedsRescan('clean', 'now with badword')).toBe(true);
    expect(editNeedsRescan(null, 'anything')).toBe(true); // old message was partial
  });
});

function fakeMessage(guildId: string, content: string, logChannel?: { send: ReturnType<typeof vi.fn>; isTextBased: () => boolean }) {
  const warn = { delete: vi.fn(async () => {}) };
  const channel = { send: vi.fn(async () => warn), isTextBased: () => true };
  const channels = new Map<string, unknown>(logChannel ? [['log1', logChannel]] : []);
  return {
    guild: { id: guildId, channels: { cache: channels } },
    author: { id: 'u9', bot: false },
    member: { permissions: { has: () => false }, roles: { cache: new Map() } },
    content,
    channel,
    channelId: 'chan1',
    delete: vi.fn(async () => {}),
    partial: false,
  } as unknown as Message & { delete: ReturnType<typeof vi.fn> };
}

describe('logSnippet', () => {
  it('spoiler-wraps, strips pipes and truncates long content', () => {
    expect(logSnippet('نص قصير')).toBe('||نص قصير||');
    expect(logSnippet('a||b|c')).toBe('||abc||');
    const long = 'x'.repeat(200);
    expect(logSnippet(long)).toBe(`||${'x'.repeat(180)}…||`);
    expect(logSnippet('|||')).toBe('');
  });
});

describe('moderateMessage — log channel', () => {
  it('logs channel, snippet and suppresses pings in the log message', async () => {
    clearConfigCache();
    await updateGuildConfig('gLog', {
      protection: {
        enabled: true,
        text_protection: true,
        custom_words: ['بادوورد'],
        log_channel_id: 'log1',
      },
    });

    const logChannel = { send: vi.fn(async () => ({})), isTextBased: () => true };
    const msg = fakeMessage('gLog', 'اشتروا من هنا @everyone بادوورد', logChannel);
    await moderateMessage(msg);

    expect(msg.delete).toHaveBeenCalledTimes(1);
    expect(logChannel.send).toHaveBeenCalledTimes(1);
    const payload = logChannel.send.mock.calls[0][0] as { content: string; allowedMentions: { parse: string[] } };
    expect(payload.content).toContain('<#chan1>'); // where it happened
    expect(payload.content).toContain('||'); // spoiler-wrapped content
    expect(payload.content).toContain('بادوورد');
    expect(payload.allowedMentions).toEqual({ parse: [] }); // no pings from reposted content
  });
});

describe('moderateMessage — edited messages', () => {
  it('deletes an edited message containing a blocked custom word', async () => {
    clearConfigCache();
    await updateGuildConfig('gEdit', {
      protection: { enabled: true, text_protection: true, custom_words: ['بادوورد'] },
    });

    const handlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
    const client = { on: (ev: string, cb: never) => (handlers[ev] = cb) } as unknown as Client;
    registerTextProtection(client);
    expect(Object.keys(handlers)).toEqual(expect.arrayContaining(['messageCreate', 'messageUpdate']));

    // clean → edited to contain the blocked word
    const edited = fakeMessage('gEdit', 'كلام فيه بادوورد الآن');
    await handlers.messageUpdate({ partial: false, content: 'كلام نظيف' }, edited);
    expect(edited.delete).toHaveBeenCalledTimes(1);
  });

  it('does not rescan when the content did not change (embed-only update)', async () => {
    clearConfigCache();
    await updateGuildConfig('gEdit2', {
      protection: { enabled: true, text_protection: true, custom_words: ['بادوورد'] },
    });

    const handlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
    const client = { on: (ev: string, cb: never) => (handlers[ev] = cb) } as unknown as Client;
    registerTextProtection(client);

    const msg = fakeMessage('gEdit2', 'رابط عادي https://example.com');
    await handlers.messageUpdate({ partial: false, content: msg.content }, msg);
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('leaves clean edits alone', async () => {
    clearConfigCache();
    await updateGuildConfig('gEdit3', {
      protection: { enabled: true, text_protection: true, custom_words: ['بادوورد'] },
    });
    const msg = fakeMessage('gEdit3', 'مرحبا يا شباب');
    await moderateMessage(msg);
    expect(msg.delete).not.toHaveBeenCalled();
  });
});
