import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  getGuildConfig: vi.fn(async () => ({
    language: 'ar',
    voice: { enabled: true, wake_word: 'يا كابتن', allowed_channel_ids: [] },
  })),
  isGuildLinked: vi.fn(async () => false),
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

import { joinCommand } from './voice.js';
import { clearPremiumCache } from '../lib/premium-cache.js';

function fakeInteraction() {
  return {
    guildId: 'g1',
    guild: { id: 'g1' },
    member: { voice: { channel: { id: 'vc1' } } },
    replies: [] as unknown[],
    reply: vi.fn(async function (this: void, msg: unknown) { return msg; }),
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  clearPremiumCache();
  db.isGuildLinked.mockClear().mockResolvedValue(false);
  sessions.joinGuildVoice.mockClear();
});

describe('/join premium gate', () => {
  it('refuses with an upsell on a guild nobody linked', async () => {
    const i = fakeInteraction();
    await joinCommand.execute(i as never);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('بريميوم') }),
    );
    expect(sessions.joinGuildVoice).not.toHaveBeenCalled();
  });

  it('joins normally on a linked guild', async () => {
    db.isGuildLinked.mockResolvedValue(true);
    const i = fakeInteraction();
    await joinCommand.execute(i as never);
    expect(sessions.joinGuildVoice).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
  });
});
