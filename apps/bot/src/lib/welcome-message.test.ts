import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, updateGuildConfig } from '@gamebot/db';
import { buildWelcomeMessage, type WelcomeMember } from './welcome-message.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

function fakeMember(guildId: string): WelcomeMember {
  return {
    id: 'u1',
    displayName: 'أبو فهد',
    guild: { id: guildId, name: 'ARAB GAMERS', memberCount: 128 },
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/u1/x.png',
  };
}

describe('buildWelcomeMessage', () => {
  it('formats the configured message with member/server/count and returns no files without a banner', async () => {
    await updateGuildConfig('gW', { welcome: { message: 'أهلاً {user} في {server} — العضو رقم {count}' } });
    const payload = await buildWelcomeMessage(fakeMember('gW'));
    expect(payload.content).toBe('أهلاً <@u1> في ARAB GAMERS — العضو رقم 128');
    expect(payload.files).toHaveLength(0);
  });

  it('uses a passed-in config without re-reading the DB', async () => {
    await updateGuildConfig('gW2', { welcome: { message: 'from-db' } });
    const config = await import('@gamebot/shared').then((m) => m.GuildConfigSchema.parse({}));
    config.welcome.message = 'من الإعداد الممرر {user}';
    const payload = await buildWelcomeMessage(fakeMember('gW2'), config);
    expect(payload.content).toBe('من الإعداد الممرر <@u1>');
  });

  it('degrades to text-only when the banner render fails (unreachable banner URL)', async () => {
    await updateGuildConfig('gW3', { welcome: { banner_url: 'https://invalid.invalid/banner.png' } });
    const payload = await buildWelcomeMessage(fakeMember('gW3'));
    expect(payload.content.length).toBeGreaterThan(0);
    expect(payload.files).toHaveLength(0); // render failed → no attachment, no throw
  });
});
