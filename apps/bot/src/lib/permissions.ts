import { PermissionFlagsBits, type GuildMember } from 'discord.js';

export function isGuildAdmin(member: GuildMember, adminRoleId: string | null): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return adminRoleId !== null && member.roles.cache.has(adminRoleId);
}
