import { describe, it, expect, vi } from 'vitest';

const baseConfig = (premiumActive: boolean) => ({
  language: 'ar',
  admin_role_id: null,
  voice: {
    enabled: true, wake_word: 'يا بوت', dialect: 'gulf', allowed_channel_ids: [], personality_enabled: false,
  },
  quotas: { listen_minutes_per_day: 60, ai_questions_per_day: 50 },
  premium: { active: premiumActive, listen_minutes_override: null, ai_questions_override: null },
});

vi.mock('@gamebot/db', () => ({
  getGuildConfig: vi.fn(async () => baseConfig(true)),
  getGuildConfigRead: vi.fn(async () => baseConfig(true)),
  getUsage: vi.fn(async () => ({ listen_seconds: 0, ai_questions: 0 })),
  incrementAiQuestions: vi.fn(async () => {}),
  consumeAiQuestion: vi.fn(async () => 1),
  refundAiQuestion: vi.fn(async () => {}),
  incrementListenSeconds: vi.fn(async () => {}),
  getCommandFlows: vi.fn(async () => GuildCommandFlowsSchema.parse({})),
}));

import { beforeEach } from 'vitest';
import { GuildCommandFlowsSchema } from '@gamebot/shared';
import { getCommandFlows, getGuildConfig } from '@gamebot/db';
import { routeVoiceCommand } from './router.js';
import { clearFlowsCache } from '../../lib/flows-cache.js';
import { clearCooldowns } from '../custom-commands/cooldown.js';
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
  beforeEach(() => {
    clearFlowsCache();
    clearCooldowns();
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({}));
  });

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

  it('runs a custom flow before built-ins and speaks its text', async () => {
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      flows: [{
        id: 'f1', name: 'Gruß', triggers: ['السرعة'], // shadows the built-in ping phrase
        actions: [{ id: 'a1', type: 'speak_tts', text: 'مرحبا {user}' }],
      }],
    }));
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'السرعة', 'u-speaker');
    expect(reply).toContain('مرحبا');
    expect(reply).not.toContain('42'); // custom flow shadowed the built-in
  });

  it('denies a custom flow to speakers outside its allowlist', async () => {
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      flows: [{
        id: 'f1', name: 'VIP', triggers: ['سر'],
        conditions: { role_ids: ['r-vip'], user_ids: [], channel_ids: [] },
        actions: [{ id: 'a1', type: 'speak_tts', text: 'ok' }],
      }],
    }));
    const guild = fakeGuild([], {
      'u-speaker': {
        id: 'u-speaker', user: { bot: false }, displayName: 'Speaker',
        voice: { channelId: 'vc1' }, roles: { cache: new Map() },
      },
    });
    const reply = await routeVoiceCommand(guild, fakeSession(), 'سر', 'u-speaker');
    expect(reply).toBe(S.commandNotAllowed);
  });

  it('a disabled built-in override stops the stock phrase from matching', async () => {
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      builtin_overrides: { ping: { enabled: false } },
    }));
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'السرعة', 'u-speaker');
    expect(reply).not.toContain('42'); // falls through to AI (which fails in tests)
  });

  it('an extra trigger from an override reaches the built-in handler', async () => {
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      builtin_overrides: { ping: { extra_triggers: ['بنج سريع'] } },
    }));
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'بنج سريع', 'u-speaker');
    expect(reply).toContain('42');
  });

  it('flows apply even without premium (execution gate deferred until payments)', async () => {
    vi.mocked(getGuildConfig).mockResolvedValue(baseConfig(false) as never);
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      flows: [{
        id: 'f1', name: 'Shadow', triggers: ['السرعة'],
        actions: [{ id: 'a1', type: 'speak_tts', text: 'مرحبا' }],
      }],
    }));
    // The editor (web) is premium-gated with a super-admin bypass; saved flows
    // must therefore run regardless of the guild's premium flag.
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'السرعة', 'u-speaker');
    expect(reply).toContain('مرحبا');
    vi.mocked(getGuildConfig).mockResolvedValue(baseConfig(true) as never);
  });

  it('cooldown silences an immediate repeat of the same flow', async () => {
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      flows: [{
        id: 'f1', name: 'Echo', triggers: ['ناداني'],
        actions: [{ id: 'a1', type: 'speak_tts', text: 'هلا' }],
      }],
    }));
    const guild = fakeGuild([]);
    expect(await routeVoiceCommand(guild, fakeSession(), 'ناداني', 'u-speaker')).toContain('هلا');
    expect(await routeVoiceCommand(guild, fakeSession(), 'ناداني', 'u-speaker')).toBe('');
  });
});
