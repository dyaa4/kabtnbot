import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from './connect.js';
import { GuildConfigModel } from './models.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('models', () => {
  it('enforces unique guild_id on GuildConfig', async () => {
    await GuildConfigModel.create({ guild_id: 'g1', config: {} });
    await expect(GuildConfigModel.create({ guild_id: 'g1', config: {} })).rejects.toThrow();
  });
});
