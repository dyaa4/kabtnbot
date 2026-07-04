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

import { getActiveMatch } from '@gamebot/db';
import { S } from '../../lib/strings.js';
import { routeVoiceCommand } from './router.js';

function fakeGuild(memberIds: string[], extraMembers: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    name: 'سيرفر',
    client: { ws: { ping: 42 } },
    members: {
      cache: new Map([
        ...memberIds.map(
          (id) => [id, { id, user: { bot: false }, displayName: id, voice: { channelId: 'vc1' } }] as const,
        ),
        ...Object.entries(extraMembers),
      ]),
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
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'السرعة', 'u-speaker');
    expect(reply).toContain('42');
  });

  it('quick-shuffles current channel members when no lobby exists', async () => {
    const reply = await routeVoiceCommand(fakeGuild(['a', 'b', 'c', 'd']), fakeSession(), 'وزع الفرق', 'u-speaker');
    expect(reply).toContain('فريق');
  });

  it('returns help text', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'ساعد', 'u-speaker');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('rejects starting the lobby match via voice when speaker is neither creator nor admin', async () => {
    vi.mocked(getActiveMatch).mockResolvedValueOnce({
      status: 'lobby',
      players: ['a', 'b'],
      creator_id: 'someone-else',
      _id: { toString: () => 'm1' },
    } as never);
    const guild = fakeGuild(['a', 'b'], {
      'u-speaker': {
        id: 'u-speaker',
        user: { bot: false },
        displayName: 'u-speaker',
        permissions: { has: () => false },
        roles: { cache: { has: () => false } },
      },
    });
    const reply = await routeVoiceCommand(guild, fakeSession(), 'وزع الفرق', 'u-speaker');
    expect(reply).toBe(S.onlyCreatorOrAdmin);
  });
});
