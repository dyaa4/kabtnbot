import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '@gamebot/db';
import { commandsHash, syncCommands } from './command-sync.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('commandsHash', () => {
  it('is stable for equal bodies and differs when the body changes', () => {
    const a = [{ name: 'ping' }, { name: 'welcome-test' }];
    expect(commandsHash(a)).toBe(commandsHash([{ name: 'ping' }, { name: 'welcome-test' }]));
    expect(commandsHash(a)).not.toBe(commandsHash([{ name: 'ping' }]));
  });
});

describe('syncCommands', () => {
  it('deploys on first run, skips when unchanged, redeploys when the set changes', async () => {
    const put = vi.fn(async () => {});

    expect(await syncCommands({ scope: 'test', body: ['a'], put })).toBe('synced');
    expect(put).toHaveBeenCalledTimes(1);

    expect(await syncCommands({ scope: 'test', body: ['a'], put })).toBe('unchanged');
    expect(put).toHaveBeenCalledTimes(1); // no extra call

    expect(await syncCommands({ scope: 'test', body: ['a', 'b'], put })).toBe('synced');
    expect(put).toHaveBeenCalledTimes(2);
  });

  it('keeps the old hash when put fails, so the next boot retries', async () => {
    const failing = vi.fn(async () => {
      throw new Error('discord down');
    });
    await expect(syncCommands({ scope: 'retry', body: ['x'], put: failing })).rejects.toThrow('discord down');

    const put = vi.fn(async () => {});
    expect(await syncCommands({ scope: 'retry', body: ['x'], put })).toBe('synced'); // retried
  });

  it('tracks scopes independently', async () => {
    const put = vi.fn(async () => {});
    expect(await syncCommands({ scope: 's1', body: ['y'], put })).toBe('synced');
    expect(await syncCommands({ scope: 's2', body: ['y'], put })).toBe('synced'); // other scope still deploys
  });
});
