import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, updateGuildConfig, recordMessage, addVoiceSeconds } from '@gamebot/db';
import { todayKey } from '@gamebot/shared';
import type { Client } from 'discord.js';
import { isSummaryDue, summaryDateKey, buildWeeklySummary, runSummarySweep } from './weekly-summary.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

const FRIDAY_EVENING = new Date('2026-07-10T19:00:00Z'); // a Friday, 19:00 UTC

describe('isSummaryDue', () => {
  it('is due only on Fridays from 18:00 UTC', () => {
    expect(isSummaryDue(FRIDAY_EVENING)).toBe(true);
    expect(isSummaryDue(new Date('2026-07-10T10:00:00Z'))).toBe(false); // Friday morning
    expect(isSummaryDue(new Date('2026-07-09T19:00:00Z'))).toBe(false); // Thursday
  });
});

describe('buildWeeklySummary', () => {
  it('includes totals and medal-ranked members', () => {
    const text = buildWeeklySummary('ARAB', { messages: 420, voiceMinutes: 137 }, [
      { user_id: 'u1', messages: 100, voice_seconds: 3600 },
      { user_id: 'u2', messages: 50, voice_seconds: 60 },
    ]);
    expect(text).toContain('ARAB');
    expect(text).toContain('**420**');
    expect(text).toContain('**137**');
    expect(text).toContain('🥇 <@u1> — 100 رسالة، 60 دقيقة صوت');
    expect(text).toContain('🥈 <@u2>');
  });
});

function fakeGuild(guildId: string) {
  const channel = { isTextBased: () => true, send: vi.fn(async () => ({})) };
  const guild = { id: guildId, name: 'ARAB', channels: { cache: new Map([['sc1', channel]]) } };
  const client = { guilds: { cache: new Map([[guildId, guild]]) } } as unknown as Client;
  return { client, channel };
}

describe('runSummarySweep', () => {
  it('posts once per Friday with real activity totals, never twice', async () => {
    await updateGuildConfig('gSum', { summary: { enabled: true, channel_id: 'sc1' } });
    await recordMessage('gSum', 'u1', todayKey());
    await recordMessage('gSum', 'u1', todayKey());
    await addVoiceSeconds('gSum', 'u1', todayKey(), 120);

    const { client, channel } = fakeGuild('gSum');
    await runSummarySweep(client, FRIDAY_EVENING);
    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0][0] as { content: string; allowedMentions: { parse: string[] } };
    expect(payload.content).toContain('**2**'); // messages
    expect(payload.content).toContain('<@u1>');
    expect(payload.allowedMentions).toEqual({ parse: [] });

    await runSummarySweep(client, FRIDAY_EVENING); // same Friday again
    expect(channel.send).toHaveBeenCalledTimes(1);

    expect(summaryDateKey(FRIDAY_EVENING)).toBe('2026-07-10');
  });

  it('does nothing when disabled or when it is not Friday evening', async () => {
    await updateGuildConfig('gSumOff', { summary: { enabled: false, channel_id: 'sc1' } });
    const off = fakeGuild('gSumOff');
    await runSummarySweep(off.client, FRIDAY_EVENING);
    expect(off.channel.send).not.toHaveBeenCalled();

    await updateGuildConfig('gSumThu', { summary: { enabled: true, channel_id: 'sc1' } });
    const thu = fakeGuild('gSumThu');
    await runSummarySweep(thu.client, new Date('2026-07-09T19:00:00Z'));
    expect(thu.channel.send).not.toHaveBeenCalled();
  });
});
