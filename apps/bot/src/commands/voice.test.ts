import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  getGuildConfig: vi.fn(async () => ({
    language: 'ar',
    voice: { enabled: true, wake_word: 'يا كابتن', allowed_channel_ids: [] },
  })),
  // Voice is STRICTLY premium: the gate reads the guild's linking accounts.
  listGuildLinkers: vi.fn(async (): Promise<{ user_id: string; premium_active: boolean }[]> => []),
}));
vi.mock('@gamebot/db', () => db);

const sessions = vi.hoisted(() => ({
  joinGuildVoice: vi.fn(async () => ({ guildId: 'g1' })),
  leaveGuildVoice: vi.fn(),
  playSpeech: vi.fn(async () => {}),
  getSession: vi.fn(() => undefined),
}));
vi.mock('../modules/voice-ai/sessions.js', () => sessions);

const listen = vi.hoisted(() => ({ startListening: vi.fn(async () => true) }));
vi.mock('../modules/voice-ai/listen.js', () => listen);

const quotas = vi.hoisted(() => ({ tryConsumeAiQuestion: vi.fn(async () => true) }));
vi.mock('../lib/quotas.js', () => quotas);

import { joinCommand, speakCommand } from './voice.js';
import { clearPremiumCache } from '../lib/premium-cache.js';

function fakeInteraction(userId = 'u1') {
  return {
    guildId: 'g1',
    guild: { id: 'g1' },
    user: { id: userId },
    member: { voice: { channel: { id: 'vc1' } } },
    options: { getString: vi.fn(() => 'اقرأ هذا') },
    replies: [] as unknown[],
    reply: vi.fn(async function (this: void, msg: unknown) { return msg; }),
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  clearPremiumCache();
  db.listGuildLinkers.mockClear().mockResolvedValue([]);
  listen.startListening.mockClear();
  sessions.joinGuildVoice.mockClear();
  sessions.playSpeech.mockClear();
  sessions.getSession.mockReturnValue({ guildId: 'g1' } as never);
  quotas.tryConsumeAiQuestion.mockClear().mockResolvedValue(true);
});

describe('/join premium gate', () => {
  it('refuses with an upsell on a guild without a premium link', async () => {
    const i = fakeInteraction();
    await joinCommand.execute(i as never);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('بريميوم') }),
    );
    expect(sessions.joinGuildVoice).not.toHaveBeenCalled();
  });

  it('a FREE account link is NOT enough — voice is strictly premium', async () => {
    db.listGuildLinkers.mockResolvedValue([{ user_id: 'free1', premium_active: false }]);
    const i = fakeInteraction();
    await joinCommand.execute(i as never);
    expect(sessions.joinGuildVoice).not.toHaveBeenCalled();
  });

  it('joins normally on a premium-linked guild', async () => {
    db.listGuildLinkers.mockResolvedValue([{ user_id: 'p1', premium_active: true }]);
    const i = fakeInteraction();
    await joinCommand.execute(i as never);
    expect(sessions.joinGuildVoice).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
  });

  it('a SUPER-ADMIN joins an unlinked guild — no payment flow exists yet', async () => {
    const i = fakeInteraction('superadmin1'); // SUPER_ADMIN_IDS, see vitest.config
    await joinCommand.execute(i as never);
    expect(sessions.joinGuildVoice).toHaveBeenCalled();
    expect(listen.startListening).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'superadmin1', // speaker → quota bypass
    );
  });

  it('a guild LINKED by a super-admin is premium for its ordinary members too', async () => {
    db.listGuildLinkers.mockResolvedValue([{ user_id: 'superadmin1', premium_active: false }]);
    const i = fakeInteraction();
    await joinCommand.execute(i as never);
    expect(sessions.joinGuildVoice).toHaveBeenCalled();
  });
});

// /speak takes arbitrary text from any member and is billed per character, so
// it must draw on the monthly pool like any other spoken output.
describe('/speak quota', () => {
  beforeEach(() => { db.listGuildLinkers.mockResolvedValue([{ user_id: 'p1', premium_active: true }]); });

  it('charges one AI question before synthesizing', async () => {
    const i = fakeInteraction();
    await speakCommand.execute(i as never);
    // The invoker travels with the charge — a super-admin is never billed.
    expect(quotas.tryConsumeAiQuestion).toHaveBeenCalledWith('g1', 'u1');
    expect(sessions.playSpeech).toHaveBeenCalledWith('g1', 'اقرأ هذا');
  });

  it('refuses — and synthesizes nothing — when the quota is exhausted', async () => {
    quotas.tryConsumeAiQuestion.mockResolvedValue(false);
    const i = fakeInteraction();
    await speakCommand.execute(i as never);
    expect(sessions.playSpeech).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('خلصت') }),
    );
  });

  it('does not charge when the bot is not in a voice channel', async () => {
    sessions.getSession.mockReturnValue(undefined as never);
    const i = fakeInteraction();
    await speakCommand.execute(i as never);
    expect(quotas.tryConsumeAiQuestion).not.toHaveBeenCalled();
  });
});
