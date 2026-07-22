import { describe, it, expect, vi } from 'vitest';

const baseConfig = (premiumActive: boolean) => ({
  language: 'ar',
  admin_role_id: null,
  voice: {
    enabled: true, wake_word: 'يا بوت', allowed_channel_ids: [], personality_enabled: false,
  },
  quotas: { listen_minutes_per_month: 600, ai_questions_per_month: 600 },
  premium: { active: premiumActive, listen_minutes_override: null, ai_questions_override: null },
});

// No realtime client by default → step 4 falls back to the text AI path.
const realtimeMock = vi.hoisted(() => ({
  client: undefined as undefined | { requestResponse: () => boolean },
}));
vi.mock('./realtime.js', () => ({ getRealtime: () => realtimeMock.client, closeRealtime: () => {} }));

vi.mock('@gamebot/db', () => ({
  getGuildConfig: vi.fn(async () => baseConfig(true)),
  getGuildConfigRead: vi.fn(async () => baseConfig(true)),
  getUsage: vi.fn(async () => ({ listen_seconds: 0, ai_questions: 0 })),
  incrementAiQuestions: vi.fn(async () => {}),
  consumeAiQuestion: vi.fn(async () => 1),
  refundAiQuestion: vi.fn(async () => {}),
  incrementListenSeconds: vi.fn(async () => {}),
  isGuildPremium: vi.fn(async () => false),
  getCommandFlows: vi.fn(async () => GuildCommandFlowsSchema.parse({})),
}));

import { beforeEach } from 'vitest';
import { GuildCommandFlowsSchema } from '@gamebot/shared';
import { getCommandFlows, getGuildConfig } from '@gamebot/db';
import { routeVoiceCommand } from './router.js';
import { clearFlowsCache } from '../../lib/flows-cache.js';
import { clearCooldowns } from '../custom-commands/cooldown.js';
import { S } from '../../lib/strings.js';
import { Conversation } from './conversation.js';

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
  return {
    guildId: 'g1', channelId: 'vc1', listening: true, subscriptions: new Map(),
    conversation: new Conversation(6000),
  } as never;
}

describe('routeVoiceCommand', () => {
  beforeEach(() => {
    clearFlowsCache();
    clearCooldowns();
    realtimeMock.client = undefined;
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({}));
  });

  it('answers ping-style commands', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'السرعة', 'u-speaker');
    expect(reply).toContain('42');
  });

  it('acknowledges a bare wake word instead of staying silent', async () => {
    // "يا كابتن" + a >500ms pause splits the utterance: the first STT chunk is
    // the wake word alone (query ''). Silence here reads as "bot ignored me".
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), '', 'u-speaker');
    expect(reply).toBe(S.wakeAck);
    expect((reply as string).length).toBeGreaterThan(0);
  });

  it('feminine imperative reaches the leave built-in (speakers address the female-voiced bot with غادري)', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'غادري القناة', 'u-speaker');
    expect(reply).toBe(S.voiceLeft);
  });

  it('bare feminine غادري leaves too', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'غادري', 'u-speaker');
    expect(reply).toBe(S.voiceLeft);
  });

  it('feminine اسكتي stops listening', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'اسكتي', 'u-speaker');
    expect(reply).toBe(S.voiceStopped);
  });

  it('returns help text', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'ساعد', 'u-speaker');
    expect((reply as string).length).toBeGreaterThan(0);
  });

  it('an EXACT trigger phrase fires the flow', async () => {
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      flows: [{
        id: 'f-songs', name: 'Songs', triggers: ['شغل الاغاني'],
        actions: [{ id: 'a1', type: 'speak_tts', text: 'رح أشغل لك الأغاني' }],
      }],
    }));
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'شغل الاغاني', 'u-speaker');
    expect(reply).toContain('الأغاني');
  });

  it('a NON-trigger utterance is answered by the assistant, never a fuzzy-matched flow', async () => {
    // The LLM intent classifier was removed from the answer path (latency): an
    // utterance that isn't the exact trigger must NOT fire the flow — the
    // realtime assistant answers it directly.
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      flows: [{
        id: 'f-songs', name: 'Songs', triggers: ['شغل الاغاني'],
        actions: [{ id: 'a1', type: 'speak_tts', text: 'رح أشغل لك الأغاني' }],
      }],
    }));
    realtimeMock.client = { requestResponse: () => true };
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'ابي اسمع شي', 'u-speaker');
    expect(reply).toEqual({ streamed: true });
  });

  it('a follow-up chat utterance is answered directly and never fires an automation', async () => {
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      flows: [{
        id: 'f-songs', name: 'Songs', triggers: ['شغل الاغاني'],
        actions: [{ id: 'a1', type: 'speak_tts', text: 'رح أشغل لك الأغاني' }],
      }],
    }));
    realtimeMock.client = { requestResponse: () => true };
    const reply = await routeVoiceCommand(
      fakeGuild([]), fakeSession(), 'ابي اسمع شي', 'u-speaker', { followUp: true },
    );
    expect(reply).toEqual({ streamed: true });
  });

  it('even the EXACT trigger does not fire an automation inside the conversation window', async () => {
    // While just talking with the bot (follow-up), custom automations are not
    // matched at all — they require an explicit wake-word utterance. So even the
    // literal trigger is answered by the assistant instead of running the flow.
    vi.mocked(getCommandFlows).mockResolvedValue(GuildCommandFlowsSchema.parse({
      flows: [{
        id: 'f-songs', name: 'Songs', triggers: ['شغل الاغاني'],
        actions: [{ id: 'a1', type: 'speak_tts', text: 'رح أشغل لك الأغاني' }],
      }],
    }));
    realtimeMock.client = { requestResponse: () => true };
    const reply = await routeVoiceCommand(
      fakeGuild([]), fakeSession(), 'شغل الاغاني', 'u-speaker', { followUp: true },
    );
    expect(reply).toEqual({ streamed: true }); // assistant answered, flow did NOT run
  });

  it('streams free-form questions through the realtime session when available', async () => {
    const requestResponse = vi.fn(() => true);
    realtimeMock.client = { requestResponse };
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'وش أفضل لعبة', 'u-speaker');
    expect(reply).toEqual({ streamed: true });
    expect(requestResponse).toHaveBeenCalledOnce();
  });

  it('falls back to the text AI path when the realtime session is busy', async () => {
    realtimeMock.client = { requestResponse: () => false };
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'وش أفضل لعبة', 'u-speaker');
    // Busy realtime must NOT swallow the question — it degrades to a text
    // reply (real answer or aiFailed, depending on configured keys).
    expect(typeof reply).toBe('string');
    expect((reply as string).length).toBeGreaterThan(0);
  });

  it('v2 mode: a free-form question is owned by the live answer session ({kind:model}), no quota/realtime call', async () => {
    const requestResponse = vi.fn(() => true);
    realtimeMock.client = { requestResponse };
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'وش أفضل لعبة', 'u-speaker', { mode: 'v2' });
    expect(reply).toEqual({ kind: 'model' });
    expect(requestResponse).not.toHaveBeenCalled(); // the router never triggers the answer in v2
  });

  it('v2 mode: built-in commands still resolve to their string reply', async () => {
    const reply = await routeVoiceCommand(fakeGuild([]), fakeSession(), 'السرعة', 'u-speaker', { mode: 'v2' });
    expect(typeof reply).toBe('string'); // ping built-in, not { kind: 'model' }
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
