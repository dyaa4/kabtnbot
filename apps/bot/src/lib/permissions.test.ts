import { describe, it, expect } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { isGuildAdmin, isInteractionMemberAdmin } from './permissions.js';

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

describe('isInteractionMemberAdmin', () => {
  const MANAGE = String(PermissionFlagsBits.ManageGuild); // serialized bitfield string

  it('null member is never admin', () => {
    expect(isInteractionMemberAdmin(null, [], 'r1')).toBe(false);
  });

  it('full GuildMember shape delegates to isGuildAdmin', () => {
    expect(isInteractionMemberAdmin(fakeMember(true, []), [], null)).toBe(true);
    expect(isInteractionMemberAdmin(fakeMember(false, ['r1']), ['r1'], 'r1')).toBe(true);
    expect(isInteractionMemberAdmin(fakeMember(false, []), [], 'r1')).toBe(false);
  });

  it('raw API shape: ManageGuild from the serialized permission string bypasses', () => {
    const raw = { roles: ['r9'], permissions: MANAGE } as never;
    expect(isInteractionMemberAdmin(raw, ['r9'], 'r1')).toBe(true);
  });

  it('raw API shape: admin role id bypasses even without ManageGuild', () => {
    const raw = { roles: ['radmin'], permissions: '0' } as never;
    expect(isInteractionMemberAdmin(raw, ['radmin'], 'radmin')).toBe(true);
  });

  it('raw API shape: neither ManageGuild nor admin role → not admin (was the bug: skipped bypass)', () => {
    const raw = { roles: ['r2'], permissions: '0' } as never;
    expect(isInteractionMemberAdmin(raw, ['r2'], 'radmin')).toBe(false);
  });

  it('raw API shape: a garbage permission string never throws', () => {
    const raw = { roles: [], permissions: 'not-a-number' } as never;
    expect(isInteractionMemberAdmin(raw, [], 'r1')).toBe(false);
  });
});
