import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  isGuildBlocked: vi.fn(async () => false),
  recordGuildPresence: vi.fn(async () => {}),
  recordGuildLeave: vi.fn(async () => {}),
  recordGuildInviter: vi.fn(async () => {}),
  countActiveInvitedGuilds: vi.fn(async () => 0),
  getUserPlan: vi.fn(async () => ({ premium: false, max_links: 1, max_guilds: 1, linked_guild_ids: [] })),
  FREE_GUILD_LIMIT: 1,
  PREMIUM_GUILD_LIMIT: 9,
}));
vi.mock('@gamebot/db', () => db);

import { registerGuildDirectory } from './guild-directory.js';

type Handler = (...args: never[]) => Promise<void> | void;

function makeClient() {
  const handlers = new Map<string, Handler>();
  const client = {
    once: (ev: string, fn: Handler) => handlers.set(ev, fn),
    on: (ev: string, fn: Handler) => handlers.set(ev, fn),
    guilds: { cache: new Map() },
    user: { id: 'bot-id' },
  };
  return { client: client as never, handlers };
}

function makeGuild(auditEntries: Array<{ targetId: string; executorId: string | null }> | 'throws') {
  return {
    id: 'g-new',
    name: 'New Guild',
    memberCount: 5,
    client: { user: { id: 'bot-id' } },
    fetchAuditLogs: vi.fn(async () => {
      if (auditEntries === 'throws') throw new Error('Missing Permissions');
      return { entries: new Map(auditEntries.map((e, i) => [String(i), e])) };
    }),
    systemChannel: { send: vi.fn(async () => ({})) },
    leave: vi.fn(async () => ({})),
  };
}

async function joinGuild(guild: ReturnType<typeof makeGuild>) {
  const { client, handlers } = makeClient();
  registerGuildDirectory(client);
  await handlers.get('guildCreate')!(guild as never);
  return guild;
}

beforeEach(() => {
  db.isGuildBlocked.mockClear().mockResolvedValue(false);
  db.recordGuildInviter.mockClear();
  db.countActiveInvitedGuilds.mockClear().mockResolvedValue(0);
  db.getUserPlan.mockClear().mockResolvedValue({ premium: false, max_links: 1, max_guilds: 1, linked_guild_ids: [] });
});

describe('guildCreate invite cap', () => {
  it('records the inviter from the audit log and stays under the limit', async () => {
    const guild = await joinGuild(makeGuild([{ targetId: 'bot-id', executorId: 'user-a' }]));
    expect(db.recordGuildInviter).toHaveBeenCalledWith('g-new', 'user-a');
    expect(guild.leave).not.toHaveBeenCalled();
  });

  it('a FREE inviter already at 1 active guild gets a farewell message and the bot leaves', async () => {
    db.countActiveInvitedGuilds.mockResolvedValue(1);
    const guild = await joinGuild(makeGuild([{ targetId: 'bot-id', executorId: 'user-a' }]));
    expect(guild.systemChannel.send).toHaveBeenCalled();
    expect(guild.leave).toHaveBeenCalled();
  });

  it('a PREMIUM inviter may add up to 9 guilds', async () => {
    db.getUserPlan.mockResolvedValue({ premium: true, max_links: 3, max_guilds: 9, linked_guild_ids: [] });
    db.countActiveInvitedGuilds.mockResolvedValue(8);
    const under = await joinGuild(makeGuild([{ targetId: 'bot-id', executorId: 'user-p' }]));
    expect(under.leave).not.toHaveBeenCalled();

    db.countActiveInvitedGuilds.mockResolvedValue(9);
    const over = await joinGuild(makeGuild([{ targetId: 'bot-id', executorId: 'user-p' }]));
    expect(over.leave).toHaveBeenCalled();
  });

  it('never caps a super-admin, however many guilds they already invited to', async () => {
    db.countActiveInvitedGuilds.mockResolvedValue(50);
    // 'superadmin1' is in SUPER_ADMIN_IDS — see vitest.config.
    const guild = await joinGuild(makeGuild([{ targetId: 'bot-id', executorId: 'superadmin1' }]));
    expect(db.recordGuildInviter).toHaveBeenCalledWith('g-new', 'superadmin1');
    expect(guild.leave).not.toHaveBeenCalled();
  });

  it('fails OPEN when the audit log is unreadable — the guild is never punished', async () => {
    const guild = await joinGuild(makeGuild('throws'));
    expect(db.recordGuildInviter).not.toHaveBeenCalled();
    expect(guild.leave).not.toHaveBeenCalled();
  });

  it('ignores audit entries for other bots', async () => {
    const guild = await joinGuild(makeGuild([{ targetId: 'other-bot', executorId: 'user-x' }]));
    expect(db.recordGuildInviter).not.toHaveBeenCalled();
    expect(guild.leave).not.toHaveBeenCalled();
  });

  it('still leaves blocked guilds before any cap logic', async () => {
    db.isGuildBlocked.mockResolvedValue(true);
    const guild = await joinGuild(makeGuild([{ targetId: 'bot-id', executorId: 'user-a' }]));
    expect(guild.leave).toHaveBeenCalled();
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
  });
});
