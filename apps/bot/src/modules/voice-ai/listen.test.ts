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

const guild = { id: 'g1' } as never;

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

function freshSession(followUp?: { userId: string; until: number }) {
  sessionMock.current = {
    guildId: 'g1', channelId: 'vc1', listening: true, subscriptions: new Map(), followUp,
  };
  return sessionMock.current as { followUp?: { userId: string; until: number } };
}

beforeEach(() => {
  realtimeMock.responding = false;
  realtimeMock.deleteItem.mockClear();
  routerMock.routeVoiceCommand.mockClear();
});

describe('handleTranscript follow-up window', () => {
  it('a wake-word utterance routes and opens the follow-up window', async () => {
    const session = freshSession();
    await handleTranscript(guild, 'u1', 'i1', 'يا كابتن كيف الحال');
    expect(routerMock.routeVoiceCommand).toHaveBeenCalledOnce();
    expect(session.followUp?.userId).toBe('u1');
    expect(session.followUp!.until).toBeGreaterThan(Date.now());
  });

  it('a follow-up is routed but does NOT extend the window (noise loops must decay)', async () => {
    const until = Date.now() + 3_000;
    const session = freshSession({ userId: 'u1', until });
    await handleTranscript(guild, 'u1', 'i1', 'وش رايك');
    expect(routerMock.routeVoiceCommand).toHaveBeenCalledOnce();
    expect(routerMock.routeVoiceCommand.mock.calls[0][4]).toEqual({ followUp: true });
    // Extending here is the runaway: every answered noise transcript would
    // keep the window open forever while a second user keeps making sounds.
    expect(session.followUp!.until).toBe(until);
  });

  it('drops a follow-up while the bot is speaking (overlap talk is not a question)', async () => {
    freshSession({ userId: 'u1', until: Date.now() + 5_000 });
    realtimeMock.responding = true;
    await handleTranscript(guild, 'u1', 'i2', 'ايوه صح');
    expect(routerMock.routeVoiceCommand).not.toHaveBeenCalled();
    expect(realtimeMock.deleteItem).toHaveBeenCalledWith('i2');
  });

  it('an explicit wake-word utterance still routes while the bot is speaking', async () => {
    freshSession({ userId: 'u1', until: Date.now() + 5_000 });
    realtimeMock.responding = true;
    await handleTranscript(guild, 'u1', 'i3', 'يا كابتن اسكتي');
    expect(routerMock.routeVoiceCommand).toHaveBeenCalledOnce();
  });

  it('another speaker inside someone else\'s window is still gated by the wake word', async () => {
    freshSession({ userId: 'u1', until: Date.now() + 5_000 });
    await handleTranscript(guild, 'u2', 'i4', 'كلام جانبي');
    expect(routerMock.routeVoiceCommand).not.toHaveBeenCalled();
    expect(realtimeMock.deleteItem).toHaveBeenCalledWith('i4');
  });
});
