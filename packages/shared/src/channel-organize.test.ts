import { describe, it, expect } from 'vitest';
import {
  sanitizeChannelName,
  reconcileOrganizePlan,
  type GuildChannelLite,
  type OrganizePlan,
} from './channel-organize.js';

describe('sanitizeChannelName', () => {
  it('lowercases text channels and turns spaces into hyphens', () => {
    expect(sanitizeChannelName('🎮 General Chat', 0)).toBe('🎮-general-chat');
  });
  it('leaves voice/stage channel names as-is (spaces + case)', () => {
    expect(sanitizeChannelName('🔊 General Voice', 2)).toBe('🔊 General Voice');
    expect(sanitizeChannelName('🎤 Stage', 13)).toBe('🎤 Stage');
  });
  it('preserves non-latin (Arabic) text and just collapses spaces', () => {
    expect(sanitizeChannelName('💬 دردشة عامة', 0)).toBe('💬-دردشة-عامة');
  });
});

const channels: GuildChannelLite[] = [
  { id: 'c1', name: 'general', type: 0, position: 0, parent_id: null },
  { id: 'c2', name: 'Gaming Voice', type: 2, position: 1, parent_id: null },
  { id: 'c3', name: 'rules', type: 0, position: 2, parent_id: null },
  { id: 'cat1', name: 'OLD CATEGORY', type: 4, position: 0, parent_id: null },
];

describe('reconcileOrganizePlan', () => {
  it('drops invalid ids, dedups, and sanitizes by the real channel type', () => {
    const plan: OrganizePlan = {
      categories: [
        { name: '💬 Text', channels: [{ id: 'c1', name: '💬 General' }, { id: 'c1', name: 'dup' }, { id: 'ghost', name: 'x' }] },
        { name: '🔊 Voice', channels: [{ id: 'c2', name: '🔊 Gaming Voice' }] },
      ],
    };
    const out = reconcileOrganizePlan(plan, channels, 'Other');
    expect(out.categories[0].channels).toEqual([{ id: 'c1', name: '💬-general' }]);
    expect(out.categories[1].channels).toEqual([{ id: 'c2', name: '🔊 Gaming Voice' }]);
  });

  it('sweeps forgotten channels into the otherLabel category, each exactly once', () => {
    const plan: OrganizePlan = { categories: [{ name: '💬 Text', channels: [{ id: 'c1', name: 'general' }] }] };
    const out = reconcileOrganizePlan(plan, channels, 'غير مصنّف');
    const other = out.categories.find((c) => c.name === 'غير مصنّف');
    expect(other).toBeDefined();
    expect(other!.channels.map((c) => c.id).sort()).toEqual(['c2', 'c3']);
    // Categories (type 4) are never treated as placeable channels.
    const allIds = out.categories.flatMap((c) => c.channels.map((ch) => ch.id));
    expect(allIds).not.toContain('cat1');
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('drops categories left empty after filtering', () => {
    const plan: OrganizePlan = {
      categories: [
        { name: 'empty', channels: [{ id: 'ghost', name: 'x' }] },
        { name: 'real', channels: [{ id: 'c1', name: 'general' }] },
      ],
    };
    const out = reconcileOrganizePlan(plan, channels, 'Other');
    expect(out.categories.some((c) => c.name === 'empty')).toBe(false);
  });
});
