import { describe, it, expect, vi, beforeEach } from 'vitest';

// handleTranscript only touches the realtime client + session state; the heavy
// audio stack (opus decode, discord voice receiver) never runs in these tests.
vi.mock('opusscript', () => ({ default: class {} }));
vi.mock('@discordjs/voice', () => ({ EndBehaviorType: { AfterSilence: 0 } }));

const cfgMock = vi.hoisted(() => ({
  language: 'ar',
  voice: {
    enabled: true, wake_word: 'يا كابتن', allowed_channel_ids: [], personality_enabled: false,
    follow_up_seconds: 10,
  },
  protection: { log_channel_id: null },
}));
vi.mock('../../lib/config-cache.js', () => ({ getCachedGuildConfig: vi.fn(async () => cfgMock) }));
vi.mock('../../lib/quotas.js', () => ({
  addListenSeconds: vi.fn(async () => {}),
  isListenQuotaExceeded: vi.fn(async () => false),
}));

const sessionMock = vi.hoisted(() => ({
  current: undefined as undefined | Record<string, unknown>,
}));
vi.mock('./sessions.js', () => ({
  getSession: () => sessionMock.current,
  playSpeech: vi.fn(async () => {}),
  playPcmStream: () => null,
}));

const realtimeMock = vi.hoisted(() => ({
  responding: false,
  deleteItem: vi.fn(),
}));
vi.mock('./realtime.js', () => ({
  ensureRealtime: vi.fn(),
  getRealtime: () => ({
    isResponding: () => realtimeMock.responding,
    deleteItem: realtimeMock.deleteItem,
  }),
}));

vi.mock('../protection/voice-mod.js', () => ({
  handleTranscriptModeration: vi.fn(async () => false),
  resolveModerationChannel: () => null,
}));

const routerMock = vi.hoisted(() => ({
  routeVoiceCommand: vi.fn(async () => ''),
}));
vi.mock('./router.js', () => ({ routeVoiceCommand: routerMock.routeVoiceCommand }));

import { handleTranscript, shouldRenewSubscription } from './listen.js';
import { Conversation } from './conversation.js';

const guild = { id: 'g1', members: { cache: new Map() } } as never;

describe('shouldRenewSubscription (leak guard)', () => {
  const guildWith = (userId: string, member: unknown) =>
    ({ members: { cache: new Map(member ? [[userId, member]] : []) } }) as never;
  const session = (listening: boolean) => ({ channelId: 'vc1', listening }) as never;

  it('renews for a non-bot member still in the channel', () => {
    const g = guildWith('u1', { user: { bot: false }, voice: { channelId: 'vc1' } });
    expect(shouldRenewSubscription(session(true), g, 'u1')).toBe(true);
  });
  it('does NOT renew for a member who left the channel (the leak case)', () => {
    const g = guildWith('u1', { user: { bot: false }, voice: { channelId: null } });
    expect(shouldRenewSubscription(session(true), g, 'u1')).toBe(false);
  });
  it('does NOT renew for a member no longer cached / gone', () => {
    expect(shouldRenewSubscription(session(true), guildWith('u1', null), 'u1')).toBe(false);
  });
  it('does NOT renew a bot or when listening stopped', () => {
    const bot = guildWith('u1', { user: { bot: true }, voice: { channelId: 'vc1' } });
    expect(shouldRenewSubscription(session(true), bot, 'u1')).toBe(false);
    const present = guildWith('u1', { user: { bot: false }, voice: { channelId: 'vc1' } });
    expect(shouldRenewSubscription(session(false), present, 'u1')).toBe(false);
  });
});

/** A session whose conversation is put into `setup` state before the test. */
function freshSession(setup?: (c: Conversation) => void) {
  const conversation = new Conversation(10_000);
  setup?.(conversation);
  sessionMock.current = {
    guildId: 'g1', channelId: 'vc1', listening: true, subscriptions: new Map(), conversation,
  };
  return sessionMock.current as { conversation: Conversation };
}

/** Bring a user to "active with an open follow-up window" (i.e. just answered). */
function engagedAndAnswered(userId: string) {
  return (c: Conversation) => {
    c.onWakeWord(userId, Date.now());
    c.onActiveUtterance();
    c.onResponseEnd(Date.now());
  };
}

beforeEach(() => {
  realtimeMock.responding = false;
  realtimeMock.deleteItem.mockClear();
  routerMock.routeVoiceCommand.mockClear();
});

describe('handleTranscript — multi-user conversation', () => {
  it('a wake word from an idle channel engages that user and routes', async () => {
    const s = freshSession();
    await handleTranscript(guild, 'u1', 'i1', 'يا كابتن كيف الحال');
    expect(routerMock.routeVoiceCommand).toHaveBeenCalledOnce();
    expect(routerMock.routeVoiceCommand.mock.calls[0][4]).toEqual({ followUp: false });
    expect(s.conversation.activeUser).toBe('u1');
  });

  it('the active user may follow up without the wake word inside the window', async () => {
    freshSession(engagedAndAnswered('u1'));
    await handleTranscript(guild, 'u1', 'i2', 'وش رايك');
    expect(routerMock.routeVoiceCommand).toHaveBeenCalledOnce();
    expect(routerMock.routeVoiceCommand.mock.calls[0][4]).toEqual({ followUp: true });
  });

  it('drops a follow-up while the bot is speaking (overlap talk is not a turn)', async () => {
    freshSession(engagedAndAnswered('u1'));
    realtimeMock.responding = true;
    await handleTranscript(guild, 'u1', 'i3', 'ايوه صح');
    expect(routerMock.routeVoiceCommand).not.toHaveBeenCalled();
    expect(realtimeMock.deleteItem).toHaveBeenCalledWith('i3');
  });

  it('an explicit wake word from the active user still routes while the bot is speaking', async () => {
    freshSession(engagedAndAnswered('u1'));
    realtimeMock.responding = true;
    await handleTranscript(guild, 'u1', 'i4', 'يا كابتن اسكتي');
    expect(routerMock.routeVoiceCommand).toHaveBeenCalledOnce();
  });

  it('ignores a non-active speaker who has no wake word', async () => {
    freshSession((c) => c.onWakeWord('u1', Date.now()));
    await handleTranscript(guild, 'u2', 'i5', 'كلام جانبي');
    expect(routerMock.routeVoiceCommand).not.toHaveBeenCalled();
    expect(realtimeMock.deleteItem).toHaveBeenCalledWith('i5');
  });

  it('QUEUES another speaker who says the wake word — no instant takeover', async () => {
    const s = freshSession((c) => c.onWakeWord('u1', Date.now()));
    await handleTranscript(guild, 'u2', 'i6', 'يا كابتن تعال');
    expect(routerMock.routeVoiceCommand).not.toHaveBeenCalled();
    expect(realtimeMock.deleteItem).toHaveBeenCalledWith('i6');
    expect(s.conversation.activeUser).toBe('u1'); // unchanged
    expect(s.conversation.queued).toEqual(['u2']); // waiting
  });
});
