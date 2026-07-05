import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGuildConfigRead = vi.fn(async () => ({
  language: 'ar',
  admin_role_id: null,
  voice: {
    enabled: true, wake_word: 'يا كابتن', dialect: 'gulf', allowed_channel_ids: [], personality_enabled: false,
  },
  quotas: { listen_minutes_per_day: 60, ai_questions_per_day: 50 },
  premium: { active: false, listen_minutes_override: null, ai_questions_override: null },
}));

vi.mock('@gamebot/db', () => ({ getGuildConfigRead: (...args: unknown[]) => getGuildConfigRead(...args) }));

import { getCachedGuildConfig, clearConfigCache } from './config-cache.js';

describe('getCachedGuildConfig', () => {
  beforeEach(() => {
    getGuildConfigRead.mockClear();
    clearConfigCache();
  });

  it('reuses the cached value on a second call within the TTL', async () => {
    await getCachedGuildConfig('g1');
    await getCachedGuildConfig('g1');
    expect(getGuildConfigRead).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after clearConfigCache', async () => {
    await getCachedGuildConfig('g1');
    clearConfigCache();
    await getCachedGuildConfig('g1');
    expect(getGuildConfigRead).toHaveBeenCalledTimes(2);
  });
});
