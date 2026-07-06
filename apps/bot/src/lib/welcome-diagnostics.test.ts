import { describe, it, expect } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { welcomeChannelIssue, type ChannelLike } from './welcome-diagnostics.js';

function channelWith(perms: bigint[] | null, textBased = true): ChannelLike {
  return {
    isTextBased: () => textBased,
    permissionsFor: () => (perms === null ? null : { has: (flag: bigint) => perms.includes(flag) }),
  };
}

const ALL = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles];
const me = {};

describe('welcomeChannelIssue', () => {
  it('flags a deleted or non-text channel as missing', () => {
    expect(welcomeChannelIssue(undefined, me)).toBe('missing');
    expect(welcomeChannelIssue(channelWith(ALL, false), me)).toBe('missing');
  });

  it('flags missing send/view permission', () => {
    expect(welcomeChannelIssue(channelWith([PermissionFlagsBits.ViewChannel]), me)).toBe('cannot_send');
    expect(welcomeChannelIssue(channelWith([PermissionFlagsBits.SendMessages]), me)).toBe('cannot_send');
  });

  it('flags missing attach-files permission separately', () => {
    expect(
      welcomeChannelIssue(channelWith([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]), me),
    ).toBe('cannot_attach');
  });

  it('returns null when everything is fine or unevaluable', () => {
    expect(welcomeChannelIssue(channelWith(ALL), me)).toBeNull();
    expect(welcomeChannelIssue(channelWith(ALL), null)).toBeNull(); // no bot member available
    expect(welcomeChannelIssue(channelWith(null), me)).toBeNull(); // perms not computable
  });
});
