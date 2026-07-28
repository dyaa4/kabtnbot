import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb, updateGuildConfig, setUserPremium, linkGuild } from '@gamebot/db';
import {
  tryConsumeAiQuestion, addListenSeconds, isAiQuotaExhausted, isListenQuotaExceeded, todayKey,
} from './quotas.js';
import { clearPremiumCache } from './premium-cache.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

describe('quotas', () => {
  it('todayKey is UTC YYYY-MM-DD', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a FREE guild has no AI budget at all (voice is premium-only)', async () => {
    expect(await tryConsumeAiQuestion('q0')).toBe(false);
    expect(await isListenQuotaExceeded('q0')).toBe(true);
  });

  it('AI questions stop at the configured MONTHLY limit', async () => {
    await updateGuildConfig('q1', { quotas: { ai_questions_per_month: 2 } });
    expect(await tryConsumeAiQuestion('q1')).toBe(true);
    expect(await tryConsumeAiQuestion('q1')).toBe(true);
    expect(await tryConsumeAiQuestion('q1')).toBe(false);
  });

  it('listen quota flips after the monthly limit', async () => {
    await updateGuildConfig('q2', { quotas: { listen_minutes_per_month: 1 } });
    expect(await isListenQuotaExceeded('q2')).toBe(false);
    await addListenSeconds('q2', 61);
    expect(await isListenQuotaExceeded('q2')).toBe(true);
  });

  it('a guild linked by a premium account gets the premium AI quota', async () => {
    await updateGuildConfig('q3', { quotas: { ai_questions_per_month: 1 } });
    await setUserPremium('owner-premium', true);
    await linkGuild('owner-premium', 'q3');
    clearPremiumCache();
    expect(await tryConsumeAiQuestion('q3')).toBe(true);
    // Beyond the configured 1/month — the premium floor (600) applies instead.
    expect(await tryConsumeAiQuestion('q3')).toBe(true);
  });

  it('a premium account\'s linked guild draws from the monthly owner pool and is capped', async () => {
    // The link limit is 1 per account, so an account maps to a single guild;
    // usage is still keyed to the OWNER pool (user:<uid>), not the guild, and
    // is hard-capped at the premium monthly minutes.
    await setUserPremium('pool-owner', true);
    await linkGuild('pool-owner', 'p-a');
    clearPremiumCache();

    // Pool = 600 min/month. Burn almost all of it, then tip it over.
    await addListenSeconds('p-a', 600 * 60 - 30);
    expect(await isListenQuotaExceeded('p-a')).toBe(false);
    await addListenSeconds('p-a', 60);
    expect(await isListenQuotaExceeded('p-a')).toBe(true);
  });

  it('a guild whose premium account is a super-admin has UNLIMITED voice quotas', async () => {
    await setUserPremium('superadmin1', true); // in SUPER_ADMIN_IDS (see vitest.config)
    await linkGuild('superadmin1', 'p-admin');
    clearPremiumCache();

    // Way past the 600-min pool — a super-admin guild is never exhausted.
    await addListenSeconds('p-admin', 600 * 60 * 5);
    expect(await isListenQuotaExceeded('p-admin')).toBe(false);
    // ...and AI questions never run out either.
    for (let i = 0; i < 3; i++) expect(await tryConsumeAiQuestion('p-admin')).toBe(true);
  });

  it('a super-admin SPEAKER is never blocked, whoever linked the guild', async () => {
    // Guild with no budget of its own (nobody premium linked it): an ordinary
    // member is refused, the super-admin asking the SAME guild is not.
    expect(await tryConsumeAiQuestion('q-admin-speaker')).toBe(false);
    expect(await tryConsumeAiQuestion('q-admin-speaker', 'superadmin1')).toBe(true);
    expect(await isAiQuotaExhausted('q-admin-speaker')).toBe(true);
    expect(await isAiQuotaExhausted('q-admin-speaker', 'superadmin1')).toBe(false);
  });

  it('a super-admin SPEAKER is never cut off from LISTENING either', async () => {
    // The listen budget was guild-only: the super-admin bypass existed for AI
    // questions but not for minutes, so the owner was told "the listening
    // minutes ran out" on /join in any guild without a premium pool.
    expect(await isListenQuotaExceeded('q-listen-speaker')).toBe(true);
    expect(await isListenQuotaExceeded('q-listen-speaker', 'superadmin1')).toBe(false);
    // ...and their minutes are not counted against anyone's pool.
    await addListenSeconds('q-listen-speaker', 120, 'superadmin1');
    expect(await isListenQuotaExceeded('q-listen-speaker', 'superadmin1')).toBe(false);
  });

  it('a guild LINKED by a super-admin is unlimited without any premium flag', async () => {
    // There is no payment flow yet, so the owner's own account is not
    // premium_active — the link alone must grant the bypass, for everyone in
    // that guild (listening is a guild-wide budget, not a per-speaker one).
    await linkGuild('superadmin2', 'g-admin-link');
    clearPremiumCache();
    expect(await isListenQuotaExceeded('g-admin-link')).toBe(false);
    expect(await tryConsumeAiQuestion('g-admin-link')).toBe(true);
    expect(await isAiQuotaExhausted('g-admin-link')).toBe(false);
  });
});
