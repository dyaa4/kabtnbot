import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  getGuildConfig: vi.fn(async () => ({
    language: 'ar',
    voice: { enabled: true, wake_word: 'يا كابتن', allowed_channel_ids: [] },
  })),
  isGuildLinked: vi.fn(async () => false),
  // Voice is STRICTLY premium: the gate checks the premium-account link.
  isGuildPremium: vi.fn(async () => false),
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

function fakeInteraction() {
  return {
    guildId: 'g1',
    guild: { id: 'g1' },
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
  db.isGuildLinked.mockClear().mockResolvedValue(false);
  db.isGuildPremium.mockClear().mockResolvedValue(false);
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
    db.isGuildLinked.mockResolvedValue(true);
    const i = fakeInteraction();
    await joinCommand.execute(i as never);
    expect(sessions.joinGuildVoice).not.toHaveBeenCalled();
  });

  it('joins normally on a premium-linked guild', async () => {
    db.isGuildPremium.mockResolvedValue(true);
    const i = fakeInteraction();
    await joinCommand.execute(i as never);
    expect(sessions.joinGuildVoice).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
  });
});

// /speak takes arbitrary text from any member and is billed per character, so
// it must draw on the monthly pool like any other spoken output.
describe('/speak quota', () => {
  beforeEach(() => { db.isGuildPremium.mockResolvedValue(true); });

  it('charges one AI question before synthesizing', async () => {
    const i = fakeInteraction();
    await speakCommand.execute(i as never);
    expect(quotas.tryConsumeAiQuestion).toHaveBeenCalledWith('g1');
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
