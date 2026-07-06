import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, updateGuildConfig } from '@gamebot/db';
import type { Client } from 'discord.js';
import { registerWelcome } from './guildMemberAdd.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

function fakeMember(guildId: string) {
  return {
    id: 'u1',
    displayName: 'أبو فهد',
    guild: { id: guildId, name: 'G', memberCount: 5, channels: { cache: new Map() } },
    roles: { add: vi.fn(async () => {}) },
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/u1/x.png',
  };
}

function capture() {
  const handlers: Record<string, (...args: never[]) => Promise<void>> = {};
  const client = { on: (ev: string, cb: never) => (handlers[ev] = cb) } as unknown as Client;
  registerWelcome(client);
  return handlers;
}

describe('guildMemberAdd — auto role', () => {
  it('assigns the configured role on join, even with welcome messages disabled', async () => {
    await updateGuildConfig('gAR', { welcome: { auto_role_id: 'r9', enabled: false } });
    const handlers = capture();
    const member = fakeMember('gAR');
    await handlers.guildMemberAdd(member as never);
    expect(member.roles.add).toHaveBeenCalledWith('r9');
  });

  it('does nothing without a configured auto role', async () => {
    await updateGuildConfig('gNoAR', { welcome: { enabled: false } });
    const handlers = capture();
    const member = fakeMember('gNoAR');
    await handlers.guildMemberAdd(member as never);
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('survives a failing role assignment (missing permission / hierarchy)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await updateGuildConfig('gARFail', { welcome: { auto_role_id: 'r9', enabled: false } });
    const handlers = capture();
    const member = fakeMember('gARFail');
    member.roles.add = vi.fn(async () => {
      throw new Error('Missing Permissions');
    });
    await handlers.guildMemberAdd(member as never); // must not throw
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
