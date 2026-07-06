import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, activeVoiceSessions, listVoiceSessions } from '@gamebot/db';
import type { Client } from 'discord.js';
import { registerVoiceLog } from './voice-log.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

function capture() {
  const handlers: Record<string, (...args: never[]) => Promise<void>> = {};
  const client = {
    on: (ev: string, cb: never) => (handlers[ev] = cb),
    once: (ev: string, cb: never) => (handlers[`once:${ev}`] = cb),
  } as unknown as Client;
  registerVoiceLog(client);
  return handlers;
}

function state(guildId: string, userId: string, channelId: string | null) {
  return { guild: { id: guildId }, id: userId, channelId, member: { user: { bot: false } } };
}

describe('voice-log listener', () => {
  it('opens a session on join, closes it on leave', async () => {
    const handlers = capture();
    await handlers.voiceStateUpdate(state('gL', 'u1', null) as never, state('gL', 'u1', 'c1') as never);
    expect(await activeVoiceSessions('gL')).toHaveLength(1);

    await handlers.voiceStateUpdate(state('gL', 'u1', 'c1') as never, state('gL', 'u1', null) as never);
    expect(await activeVoiceSessions('gL')).toHaveLength(0);
    expect(await listVoiceSessions('gL', 1)).toHaveLength(1);
  });

  it('a channel move closes the old session and opens a new one', async () => {
    const handlers = capture();
    await handlers.voiceStateUpdate(state('gL2', 'u1', null) as never, state('gL2', 'u1', 'c1') as never);
    await handlers.voiceStateUpdate(state('gL2', 'u1', 'c1') as never, state('gL2', 'u1', 'c2') as never);
    const active = await activeVoiceSessions('gL2');
    expect(active).toHaveLength(1);
    expect(active[0].channel_id).toBe('c2');
    expect(await listVoiceSessions('gL2', 1)).toHaveLength(2); // closed c1 + open c2
  });

  it('ignores mute/deafen updates (same channel) and bots', async () => {
    const handlers = capture();
    await handlers.voiceStateUpdate(state('gL3', 'u1', 'c1') as never, state('gL3', 'u1', 'c1') as never);
    expect(await listVoiceSessions('gL3', 1)).toHaveLength(0);

    const botState = { guild: { id: 'gL3' }, id: 'b1', channelId: 'c1', member: { user: { bot: true } } };
    await handlers.voiceStateUpdate({ ...botState, channelId: null } as never, botState as never);
    expect(await listVoiceSessions('gL3', 1)).toHaveLength(0);
  });
});
