import { PermissionFlagsBits } from 'discord.js';

/** Structural subsets so tests can pass plain objects. */
export interface ChannelLike {
  isTextBased(): boolean;
  permissionsFor(member: unknown): { has(flag: bigint): boolean } | null;
}

export type WelcomeChannelIssue = 'missing' | 'cannot_send' | 'cannot_attach' | null;

/**
 * Why welcome messages would silently fail in the configured channel — the
 * send path swallows errors by design, so /welcome-test surfaces this.
 */
export function welcomeChannelIssue(channel: ChannelLike | undefined, me: unknown): WelcomeChannelIssue {
  if (!channel || !channel.isTextBased()) return 'missing';
  if (!me) return null; // cannot evaluate permissions without the bot member
  const perms = channel.permissionsFor(me);
  if (!perms) return null;
  if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) {
    return 'cannot_send';
  }
  if (!perms.has(PermissionFlagsBits.AttachFiles)) return 'cannot_attach';
  return null;
}
