import { PermissionFlagsBits, type GuildMember } from 'discord.js';

export function isGuildAdmin(member: GuildMember, adminRoleId: string | null): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return adminRoleId !== null && member.roles.cache.has(adminRoleId);
}

/**
 * Admin check that works for BOTH interaction member shapes. A cached member is
 * a full GuildMember (roles = Collection, permissions = PermissionsBitField); an
 * uncached one is the raw API shape (roles = string[], permissions = serialized
 * bitfield string). Calling isGuildAdmin on the raw shape throws, so the admin
 * bypass used to be skipped there — letting an admin lock themselves out of a
 * restricted built-in command. Admin = ManageGuild or the configured admin role.
 */
export function isInteractionMemberAdmin(
  member: { roles: unknown; permissions: unknown } | null,
  roleIds: string[],
  adminRoleId: string | null,
): boolean {
  if (!member) return false;
  if (!Array.isArray(member.roles)) return isGuildAdmin(member as unknown as GuildMember, adminRoleId);
  // Raw API shape: permissions is a serialized bitfield string.
  let hasManageGuild = false;
  try {
    hasManageGuild =
      (BigInt(String(member.permissions)) & PermissionFlagsBits.ManageGuild) === PermissionFlagsBits.ManageGuild;
  } catch {
    hasManageGuild = false;
  }
  return hasManageGuild || (adminRoleId !== null && roleIds.includes(adminRoleId));
}
