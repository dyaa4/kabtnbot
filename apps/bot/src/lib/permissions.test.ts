import { describe, it, expect } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { isGuildAdmin } from './permissions.js';

function fakeMember(hasManageGuild: boolean, roleIds: string[]) {
  return {
    permissions: { has: (p: bigint) => hasManageGuild && p === PermissionFlagsBits.ManageGuild },
    roles: { cache: { has: (id: string) => roleIds.includes(id) } },
  } as never;
}

describe('isGuildAdmin', () => {
  it('allows ManageGuild permission', () => {
    expect(isGuildAdmin(fakeMember(true, []), null)).toBe(true);
  });
  it('allows configured admin role', () => {
    expect(isGuildAdmin(fakeMember(false, ['r1']), 'r1')).toBe(true);
  });
  it('denies otherwise', () => {
    expect(isGuildAdmin(fakeMember(false, []), 'r1')).toBe(false);
    expect(isGuildAdmin(fakeMember(false, ['r2']), null)).toBe(false);
  });
});
