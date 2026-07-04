import { describe, it, expect, vi } from 'vitest';

vi.mock('@gamebot/db', () => ({
  getGuildConfig: vi.fn(async () => ({
    language: 'ar',
    voice: { enabled: true, wake_word: 'يا بوت', dialect: 'gulf', allowed_channel_ids: [] },
    customs: { win_points: 25, loss_points: -10, admin_role_id: null },
    quotas: { listen_minutes_per_day: 60, ai_questions_per_day: 50 },
  })),
  getActiveMatch: vi.fn(async () => null),
  getPointsMap: vi.fn(async () => new Map()),
  getUsage: vi.fn(async () => ({ listen_seconds: 0, ai_questions: 0 })),
  incrementAiQuestions: vi.fn(async () => {}),
  incrementListenSeconds: vi.fn(async () => {}),
}));

import { routeVoiceCommand } from './router.js';

function fakeGuild(memberIds: string[]) {
  return {
    id: 'g1',
    name: 'سيرفر',
    client: { ws: { ping: 42 } },
    members: {
      cache: new Map(
        memberIds.map((id) => [id, { id, user: { bot: false }, displayName: id, voice: { channelId: 'vc1' } }]),
      ),
    },
    channels: {
      cache: new Map([
        ['vc1', {
          id: 'vc1',
          isVoiceBased: () => true,
          members: new Map(memberIds.map((id) => [id, { id, user: { bot: false }, displayName: id }])),
        }],
      ]),
    },
  } as never;
}

function fakeSession() {
  return { guildId: 'g1', channelId: 'vc1', listening: true, subscriptions: new Map() } as never;
}

describe('routeVoiceCommand', () => {
  it('answers ping-style commands', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'السرعة');
    expect(reply).toContain('42');
  });

  it('quick-shuffles current channel members when no lobby exists', async () => {
    const reply = await routeVoiceCommand(fakeGuild(['a', 'b', 'c', 'd']), fakeSession(), 'وزع الفرق');
    expect(reply).toContain('فريق');
  });

  it('returns help text', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'ساعد');
    expect(reply.length).toBeGreaterThan(0);
  });
});
