import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { getGuildConfig, updateGuildConfig } from './guild-config-repo.js';
import { applyMatchResult, getPlayer, topPlayers, getPointsMap } from './player-repo.js';
import {
  createMatch, getActiveMatch, addPlayerToMatch, removePlayerFromMatch,
  setMatchStarted, completeMatch, cancelMatch, findExpiredMatches,
} from './match-repo.js';
import { incrementAiQuestions, incrementListenSeconds, getUsage } from './usage-repo.js';

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
    expect(c.voice.wake_word).toBe('يا بوت');
    const updated = await updateGuildConfig('g1', { voice: { dialect: 'syrian' } });
    expect(updated.voice.dialect).toBe('syrian');
    expect(updated.voice.wake_word).toBe('يا بوت'); // merge, not replace
  });

  it('rejects invalid patches', async () => {
    await expect(updateGuildConfig('g1', { voice: { dialect: 'xx' } })).rejects.toThrow();
  });

  it('first access creates exactly one config document', async () => {
    await Promise.all([getGuildConfig('gRace'), getGuildConfig('gRace'), getGuildConfig('gRace')]);
    const { GuildConfigModel } = await import('../models.js');
    expect(await GuildConfigModel.countDocuments({ guild_id: 'gRace' })).toBe(1);
  });
});

describe('player-repo', () => {
  it('applies match results and isolates guilds', async () => {
    await applyMatchResult('gA', ['w1', 'w2'], ['l1'], 25, -10);
    const w1 = await getPlayer('gA', 'w1');
    expect(w1?.points).toBe(25);
    expect(w1?.wins).toBe(1);
    const l1 = await getPlayer('gA', 'l1');
    expect(l1?.points).toBe(-10);
    expect(l1?.losses).toBe(1);
    // tenant isolation: same user id in another guild is untouched
    expect(await getPlayer('gB', 'w1')).toBeNull();
    const top = await topPlayers('gA', 10);
    expect(top[0].user_id).toBe('w1');
    const map = await getPointsMap('gA', ['w1', 'unknown']);
    expect(map.get('w1')).toBe(25);
    expect(map.get('unknown')).toBe(0);
  });
});

describe('match-repo', () => {
  it('runs full lifecycle and enforces one active match per guild', async () => {
    const m = await createMatch({
      guildId: 'gM', creatorId: 'c1', game: 'فالورانت',
      teamSize: 2, balanceMode: 'random', lobbyChannelId: 'ch1',
    });
    await expect(
      createMatch({ guildId: 'gM', creatorId: 'c1', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch1' }),
    ).rejects.toThrow('ACTIVE_MATCH_EXISTS');

    await addPlayerToMatch('gM', m._id.toString(), 'p1');
    await addPlayerToMatch('gM', m._id.toString(), 'p1'); // duplicate: no-op
    let active = await getActiveMatch('gM');
    expect(active?.players).toEqual(['p1']);

    await removePlayerFromMatch('gM', m._id.toString(), 'p1');
    active = await getActiveMatch('gM');
    expect(active?.players).toEqual([]);

    await setMatchStarted('gM', m._id.toString(), ['p1'], ['p2'], ['vc1', 'vc2']);
    active = await getActiveMatch('gM');
    expect(active?.status).toBe('in_progress');

    await completeMatch('gM', m._id.toString(), 'a');
    expect(await getActiveMatch('gM')).toBeNull();

    // wrong guild id cannot touch another guild's match (isolation)
    const m2 = await createMatch({
      guildId: 'gM', creatorId: 'c1', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch1',
    });
    expect(await cancelMatch('OTHER_GUILD', m2._id.toString())).toBeNull();
    expect(await getActiveMatch('gM')).not.toBeNull();
    await cancelMatch('gM', m2._id.toString());
  });

  it('finds expired matches across guilds', async () => {
    await createMatch({
      guildId: 'gOld', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch',
    });
    const future = new Date(Date.now() + 1000);
    const expired = await findExpiredMatches(future);
    expect(expired.some((m) => m.guild_id === 'gOld')).toBe(true);
    const past = new Date(Date.now() - 60_000);
    expect((await findExpiredMatches(past)).some((m) => m.guild_id === 'gOld')).toBe(false);
  });

  it('rejects joins beyond team_size * 2 capacity', async () => {
    const m = await createMatch({
      guildId: 'gCap', creatorId: 'c', game: 'x', teamSize: 1, balanceMode: 'random', lobbyChannelId: 'ch',
    });
    expect(await addPlayerToMatch('gCap', m._id.toString(), 'p1')).not.toBeNull();
    expect(await addPlayerToMatch('gCap', m._id.toString(), 'p2')).not.toBeNull();
    expect(await addPlayerToMatch('gCap', m._id.toString(), 'p3')).toBeNull();
    await cancelMatch('gCap', m._id.toString());
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
