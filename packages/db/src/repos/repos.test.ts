import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { getGuildConfig, getGuildConfigRead, updateGuildConfig } from './guild-config-repo.js';
import { incrementAiQuestions, incrementListenSeconds, getUsage } from './usage-repo.js';
import { putGuildAsset, getGuildAsset, deleteGuildAsset, MAX_ASSET_BYTES } from './guild-asset-repo.js';
import { recordBotHeartbeat, getBotStatus, clearBotHeartbeat, BOT_OFFLINE_AFTER_MS } from './bot-status-repo.js';
import { getUserPlan, setUserPremium, linkGuild, unlinkGuild, isGuildLinked } from './user-accounts-repo.js';
import { getKv, setKv } from './kv-repo.js';
import {
  startVoiceSession, endVoiceSession, closeAllOpenVoiceSessions,
  activeVoiceSessions, listVoiceSessions,
} from './voice-log-repo.js';
import { getCommandFlows, putCommandFlows } from './command-flows-repo.js';
import { getScheduleRuns, setScheduleRun } from './schedule-runs-repo.js';
import { recordChatMessage, listChatMessages } from './chat-log-repo.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('guild-config-repo', () => {
  it('creates defaults on first access and persists patches', async () => {
    const c = await getGuildConfig('g1');
    expect(c.voice.wake_word).toBe('يا كابتن');
    const updated = await updateGuildConfig('g1', { voice: { tts_voice: 'noura' } });
    expect(updated.voice.tts_voice).toBe('noura');
    expect(updated.voice.wake_word).toBe('يا كابتن'); // merge, not replace
  });

  it('rejects invalid patches', async () => {
    await expect(updateGuildConfig('g1', { voice: { tts_voice: 'xx' } })).rejects.toThrow();
  });

  it('first access creates exactly one config document', async () => {
    await Promise.all([getGuildConfig('gRace'), getGuildConfig('gRace'), getGuildConfig('gRace')]);
    const { GuildConfigModel } = await import('../models.js');
    expect(await GuildConfigModel.countDocuments({ guild_id: 'gRace' })).toBe(1);
  });

  it('getGuildConfigRead returns defaults without creating a document, and reads updates', async () => {
    const { GuildConfigModel } = await import('../models.js');
    const c = await getGuildConfigRead('gReadOnly');
    expect(c.voice.wake_word).toBe('يا كابتن'); // defaults
    expect(await GuildConfigModel.countDocuments({ guild_id: 'gReadOnly' })).toBe(0); // no write
    await updateGuildConfig('gReadOnly', { protection: { custom_words: ['zzz'] } });
    expect((await getGuildConfigRead('gReadOnly')).protection.custom_words).toContain('zzz');
  });
});

describe('command-flows-repo', () => {
  it('returns defaults without creating a document', async () => {
    const { CommandFlowsModel } = await import('../models.js');
    const data = await getCommandFlows('gF0');
    expect(data.flows).toEqual([]);
    expect(data.builtin_overrides).toEqual({});
    expect(await CommandFlowsModel.countDocuments({ guild_id: 'gF0' })).toBe(0);
  });

  it('put → get round-trips and fully replaces (no merge)', async () => {
    const flowOf = (id: string, trigger: string) => ({
      id, name: id, triggers: [trigger],
      actions: [{ id: 'a1', type: 'voice_leave' }],
    });
    await putCommandFlows('gF1', { flows: [flowOf('one', 'raus'), flowOf('two', 'stopp')] });
    expect((await getCommandFlows('gF1')).flows).toHaveLength(2);

    // Full replace: a save with one flow deletes the other.
    await putCommandFlows('gF1', {
      flows: [flowOf('one', 'raus')],
      builtin_overrides: { kick: { role_ids: ['r1'] } },
    });
    const after = await getCommandFlows('gF1');
    expect(after.flows.map((f) => f.id)).toEqual(['one']);
    expect(after.builtin_overrides.kick?.role_ids).toEqual(['r1']);
    expect(after.flows[0].enabled).toBe(true); // defaults filled by Zod
  });

  it('rejects invalid data', async () => {
    await expect(
      putCommandFlows('gF2', { flows: [{ id: 'x', name: 'bad', triggers: [], actions: [] }] }),
    ).rejects.toThrow();
    expect((await getCommandFlows('gF2')).flows).toEqual([]); // nothing persisted
  });
});

describe('schedule-runs-repo', () => {
  it('round-trips last-run times per guild+flow and upserts on repeat', async () => {
    expect((await getScheduleRuns('gS')).size).toBe(0);
    const t0 = new Date('2026-07-13T10:00:00Z');
    const t1 = new Date('2026-07-13T12:00:00Z');
    await setScheduleRun('gS', 'flow1', t0);
    await setScheduleRun('gS', 'flow2', t0);
    await setScheduleRun('gS', 'flow1', t1); // update, not duplicate
    const runs = await getScheduleRuns('gS');
    expect(runs.get('flow1')?.toISOString()).toBe(t1.toISOString());
    expect(runs.get('flow2')?.toISOString()).toBe(t0.toISOString());
    expect((await getScheduleRuns('gOther')).size).toBe(0); // guild-scoped
  });
});

describe('chat-log-repo', () => {
  it('records messages and lists them newest first', async () => {
    const t0 = new Date('2026-07-10T10:00:00Z');
    const t1 = new Date('2026-07-10T11:00:00Z');
    await recordChatMessage({ guildId: 'gC', userId: 'u1', channelId: 'c1', messageId: 'm1', content: 'hallo', at: t0 });
    await recordChatMessage({ guildId: 'gC', userId: 'u2', channelId: 'c2', messageId: 'm2', content: 'يا هلا', at: t1 });
    const list = await listChatMessages('gC');
    expect(list.map((m) => m.message_id)).toEqual(['m2', 'm1']);
    expect(list[0].content).toBe('يا هلا');
    expect(await listChatMessages('gOther')).toEqual([]);
  });

  it('caps stored content at 500 chars and skips empty messages', async () => {
    await recordChatMessage({ guildId: 'gC2', userId: 'u1', channelId: 'c1', messageId: 'mBig', content: 'x'.repeat(900) });
    await recordChatMessage({ guildId: 'gC2', userId: 'u1', channelId: 'c1', messageId: 'mEmpty', content: '' });
    const list = await listChatMessages('gC2');
    expect(list).toHaveLength(1);
    expect(list[0].content).toHaveLength(500);
  });
});

describe('guild-asset-repo', () => {
  it('round-trips an asset and overwrites on re-upload', async () => {
    await putGuildAsset('gA', 'welcome_banner', 'image/png', Buffer.from([1, 2, 3]));
    const a = await getGuildAsset('gA', 'welcome_banner');
    expect(a?.content_type).toBe('image/png');
    expect(Buffer.compare(a!.data, Buffer.from([1, 2, 3]))).toBe(0);

    await putGuildAsset('gA', 'welcome_banner', 'image/jpeg', Buffer.from([9]));
    const b = await getGuildAsset('gA', 'welcome_banner');
    expect(b?.content_type).toBe('image/jpeg');
    expect(Buffer.compare(b!.data, Buffer.from([9]))).toBe(0);
  });

  it('returns null for missing assets and after delete', async () => {
    expect(await getGuildAsset('gNone', 'welcome_banner')).toBeNull();
    await putGuildAsset('gDel', 'welcome_banner', 'image/png', Buffer.from([5]));
    await deleteGuildAsset('gDel', 'welcome_banner');
    expect(await getGuildAsset('gDel', 'welcome_banner')).toBeNull();
  });

  it('rejects empty and oversized payloads', async () => {
    await expect(putGuildAsset('gBig', 'welcome_banner', 'image/png', Buffer.alloc(0))).rejects.toThrow();
    await expect(
      putGuildAsset('gBig', 'welcome_banner', 'image/png', Buffer.alloc(MAX_ASSET_BYTES + 1)),
    ).rejects.toThrow();
  });
});

describe('voice-log-repo', () => {
  it('tracks join → leave with computed duration', async () => {
    const t0 = new Date('2026-07-06T20:00:00Z');
    const t1 = new Date('2026-07-06T21:30:00Z');
    await startVoiceSession('gV', 'u1', 'c1', t0);
    expect((await activeVoiceSessions('gV', t1))[0]).toMatchObject({ user_id: 'u1', channel_id: 'c1' });
    await endVoiceSession('gV', 'u1', t1);
    expect(await activeVoiceSessions('gV')).toHaveLength(0);
    const [session] = await listVoiceSessions('gV', 7, 200, t1);
    expect(session.seconds).toBe(90 * 60);
    expect(session.left_at).not.toBeNull();
  });

  it('a new join closes any dangling open session (missed leave)', async () => {
    await startVoiceSession('gV2', 'u1', 'c1');
    await startVoiceSession('gV2', 'u1', 'c2'); // moved channels, leave event lost
    const active = await activeVoiceSessions('gV2');
    expect(active).toHaveLength(1);
    expect(active[0].channel_id).toBe('c2');
  });

  it('closeAllOpenVoiceSessions ends everything (startup reconcile)', async () => {
    await startVoiceSession('gV3', 'u1', 'c1');
    await startVoiceSession('gV3', 'u2', 'c1');
    await closeAllOpenVoiceSessions();
    expect(await activeVoiceSessions('gV3')).toHaveLength(0);
  });

  it('listVoiceSessions respects the day window', async () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await startVoiceSession('gV4', 'u1', 'c1', old);
    await endVoiceSession('gV4', 'u1', new Date(old.getTime() + 60_000));
    await startVoiceSession('gV4', 'u2', 'c1');
    const recent = await listVoiceSessions('gV4', 7);
    expect(recent).toHaveLength(1);
    expect(recent[0].user_id).toBe('u2');
  });
});

describe('kv-repo', () => {
  it('returns null for unknown keys and round-trips values', async () => {
    expect(await getKv('nope')).toBeNull();
    await setKv('k1', 'v1');
    expect(await getKv('k1')).toBe('v1');
    await setKv('k1', 'v2'); // overwrite
    expect(await getKv('k1')).toBe('v2');
  });
});

describe('bot-status-repo', () => {
  it('reports offline with no heartbeat, online after one, offline once stale', async () => {
    expect((await getBotStatus()).online).toBe(false);

    await recordBotHeartbeat(7);
    const fresh = await getBotStatus();
    expect(fresh.online).toBe(true);
    expect(fresh.guild_count).toBe(7);
    expect(fresh.last_seen).toBeTruthy();

    const later = new Date(Date.now() + BOT_OFFLINE_AFTER_MS + 1000);
    expect((await getBotStatus(later)).online).toBe(false);
  });

  it('clearBotHeartbeat flips status to offline immediately', async () => {
    await recordBotHeartbeat(4);
    expect((await getBotStatus()).online).toBe(true);
    await clearBotHeartbeat();
    expect((await getBotStatus()).online).toBe(false);
  });
});

describe('usage-repo', () => {
  it('accumulates per guild per day', async () => {
    await incrementAiQuestions('gU', '2026-07-04');
    await incrementAiQuestions('gU', '2026-07-04');
    await incrementListenSeconds('gU', 30, '2026-07-04');
    const u = await getUsage('gU', '2026-07-04');
    expect(u.ai_questions).toBe(2);
    expect(u.listen_seconds).toBe(30);
    expect((await getUsage('gU', '2026-07-05')).ai_questions).toBe(0);
  });
});

describe('user-accounts-repo', () => {
  it('free plan links exactly one guild; the second link is rejected', async () => {
    expect((await getUserPlan('u1')).max_links).toBe(1);
    const linked = await linkGuild('u1', 'gA');
    expect(linked?.linked_guild_ids).toEqual(['gA']);
    expect(await linkGuild('u1', 'gB')).toBeNull(); // limit reached
    expect(await linkGuild('u1', 'gA')).not.toBeNull(); // re-link is idempotent
  });

  it('premium raises the limit to three linked guilds', async () => {
    await setUserPremium('u2', true);
    for (const g of ['g1', 'g2', 'g3']) expect(await linkGuild('u2', g)).not.toBeNull();
    expect(await linkGuild('u2', 'g4')).toBeNull();
    expect((await getUserPlan('u2')).linked_guild_ids).toEqual(['g1', 'g2', 'g3']);
  });

  it('unlink frees a slot and the guild-linked gate follows', async () => {
    await linkGuild('u3', 'gX');
    expect(await isGuildLinked('gX')).toBe(true);
    await unlinkGuild('u3', 'gX');
    expect(await isGuildLinked('gX')).toBe(false);
    expect((await linkGuild('u3', 'gY'))?.linked_guild_ids).toEqual(['gY']);
  });
});

