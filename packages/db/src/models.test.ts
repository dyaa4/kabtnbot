import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from './connect.js';
import { GuildConfigModel, PlayerModel } from './models.js';

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

  it('enforces compound unique (guild_id, user_id) on Player', async () => {
    await PlayerModel.create({ guild_id: 'g1', user_id: 'u1' });
    await PlayerModel.create({ guild_id: 'g2', user_id: 'u1' }); // same user, other guild: OK
    await expect(PlayerModel.create({ guild_id: 'g1', user_id: 'u1' })).rejects.toThrow();
  });
});
