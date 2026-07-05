import { describe, it, expect, vi } from 'vitest';

vi.mock('@gamebot/db', () => ({
  getGuildConfig: vi.fn(async () => ({
    language: 'ar',
    admin_role_id: null,
    voice: {
      enabled: true, wake_word: 'يا بوت', dialect: 'gulf', allowed_channel_ids: [], personality_enabled: false,
    },
    quotas: { listen_minutes_per_day: 60, ai_questions_per_day: 50 },
    premium: { active: false, listen_minutes_override: null, ai_questions_override: null },
  })),
  getUsage: vi.fn(async () => ({ listen_seconds: 0, ai_questions: 0 })),
  incrementAiQuestions: vi.fn(async () => {}),
  incrementListenSeconds: vi.fn(async () => {}),
}));

import { routeVoiceCommand } from './router.js';
import { S } from '../../lib/strings.js';

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

  it('returns help text', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'ساعد', 'u-speaker');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('denies kick command from a non-admin speaker', async () => {
    const guild = fakeGuild(['u2'], {
      'u-speaker': {
        id: 'u-speaker',
        user: { bot: false },
        displayName: 'Speaker',
        voice: { channelId: 'vc1' },
        permissions: { has: () => false },
        roles: { cache: new Map() },
      },
    });
    const reply = await routeVoiceCommand(guild, fakeSession(), 'اطرد u2', 'u-speaker');
    expect(reply).toBe(S.kickNeedsAdmin);
  });
});
