import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Conversation } from './conversation.js';

const cfgMock = vi.hoisted(() => ({
  language: 'ar',
  voice: { wake_word: 'يا كابتن', follow_up_seconds: 10 },
  protection: { log_channel_id: null },
}));
vi.mock('../../lib/config-cache.js', () => ({ getCachedGuildConfig: vi.fn(async () => cfgMock) }));

const sessionMock = vi.hoisted(() => ({ current: undefined as undefined | Record<string, unknown> }));
const playSpeech = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./sessions.js', () => ({ getSession: () => sessionMock.current, playSpeech }));

const answerMock = vi.hoisted(() => ({
  activeUser: null as string | null,
  abort: vi.fn(),
  clearContext: vi.fn(),
  setActiveUser: vi.fn(),
}));
vi.mock('./answer-session.js', () => ({ getAnswerSession: () => answerMock }));

const quotaMock = vi.hoisted(() => ({ ok: true }));
vi.mock('../../lib/quotas.js', () => ({ tryConsumeAiQuestion: vi.fn(async () => quotaMock.ok) }));

const modMock = vi.hoisted(() => ({ flagged: false }));
vi.mock('../protection/voice-mod.js', () => ({
  handleTranscriptModeration: vi.fn(async () => modMock.flagged),
  resolveModerationChannel: () => null,
}));

const routerMock = vi.hoisted(() => ({ result: { kind: 'model' } as unknown }));
vi.mock('./router.js', () => ({ routeVoiceCommand: vi.fn(async () => routerMock.result) }));

import { handleFirehoseTranscript } from './firehose.js';
import { routeVoiceCommand } from './router.js';

const guild = { id: 'g1', members: { cache: new Map() } } as never;
const seed = Buffer.alloc(4800);
const optsOf = (call: number) => vi.mocked(routeVoiceCommand).mock.calls[call][4];

function freshSession(setup?: (c: Conversation) => void) {
  const conversation = new Conversation(10_000);
  setup?.(conversation);
  sessionMock.current = { guildId: 'g1', channelId: 'vc1', listening: true, conversation };
  return sessionMock.current as { conversation: Conversation };
}

beforeEach(() => {
  modMock.flagged = false;
  quotaMock.ok = true;
  routerMock.result = { kind: 'model' };
  answerMock.activeUser = null;
  answerMock.abort.mockClear();
  answerMock.clearContext.mockClear();
  answerMock.setActiveUser.mockClear();
  playSpeech.mockClear();
  vi.mocked(routeVoiceCommand).mockClear();
});

describe('handleFirehoseTranscript', () => {
  it('a wake word from idle engages, routes in v2 mode, and seeds the answer session', async () => {
    const s = freshSession();
    await handleFirehoseTranscript(guild, 'u1', 'يا كابتن كم الساعة', seed);
    expect(s.conversation.activeUser).toBe('u1');
    expect(optsOf(0)).toEqual({ followUp: false, mode: 'v2' });
    expect(answerMock.setActiveUser).toHaveBeenCalledWith('u1', 'u1', seed);
  });

  it('flagged moderation on the ACTIVE user aborts the answer + clears context, no routing', async () => {
    freshSession((c) => c.onWakeWord('u1', Date.now()));
    answerMock.activeUser = 'u1';
    modMock.flagged = true;
    await handleFirehoseTranscript(guild, 'u1', 'شتيمة', seed);
    expect(answerMock.abort).toHaveBeenCalled();
    expect(answerMock.clearContext).toHaveBeenCalled();
    expect(routeVoiceCommand).not.toHaveBeenCalled();
  });

  it('flagged moderation on a NON-active user does not touch the answer session', async () => {
    freshSession((c) => c.onWakeWord('u1', Date.now()));
    answerMock.activeUser = 'u1';
    modMock.flagged = true;
    await handleFirehoseTranscript(guild, 'u2', 'شتيمة', seed);
    expect(answerMock.abort).not.toHaveBeenCalled();
    expect(routeVoiceCommand).not.toHaveBeenCalled();
  });

  it('queues another speaker who says the wake word — no routing, no seed', async () => {
    freshSession((c) => c.onWakeWord('u1', Date.now()));
    answerMock.activeUser = 'u1';
    await handleFirehoseTranscript(guild, 'u2', 'يا كابتن تعال', seed);
    expect(routeVoiceCommand).not.toHaveBeenCalled();
    expect(answerMock.setActiveUser).not.toHaveBeenCalled();
  });

  it('ignores a non-active speaker without a wake word', async () => {
    freshSession((c) => c.onWakeWord('u1', Date.now()));
    await handleFirehoseTranscript(guild, 'u2', 'كلام جانبي', seed);
    expect(routeVoiceCommand).not.toHaveBeenCalled();
  });

  it('a built-in/flow command reply aborts the live answer and speaks verbatim', async () => {
    freshSession();
    routerMock.result = 'تم الإيقاف';
    await handleFirehoseTranscript(guild, 'u1', 'يا كابتن اسكتي', seed);
    expect(answerMock.abort).toHaveBeenCalled();
    expect(playSpeech).toHaveBeenCalledWith('g1', 'تم الإيقاف');
    expect(answerMock.setActiveUser).not.toHaveBeenCalled(); // a command, not a model answer
  });

  it('aborts and announces when the AI quota is exhausted', async () => {
    freshSession();
    quotaMock.ok = false;
    await handleFirehoseTranscript(guild, 'u1', 'يا كابتن سؤال', seed);
    expect(answerMock.abort).toHaveBeenCalled();
    expect(playSpeech).toHaveBeenCalled();
    expect(answerMock.setActiveUser).not.toHaveBeenCalled();
  });

  it('a follow-up (model) does not re-seed — the live audio already answered', async () => {
    freshSession((c) => { c.onWakeWord('u1', Date.now()); c.onResponseEnd(Date.now()); });
    await handleFirehoseTranscript(guild, 'u1', 'وش رايك', seed);
    expect(optsOf(0)).toEqual({ followUp: true, mode: 'v2' });
    expect(answerMock.setActiveUser).not.toHaveBeenCalled();
  });
});
