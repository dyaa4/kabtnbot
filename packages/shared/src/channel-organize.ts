import { z } from 'zod';

// Discord channel types the organizer arranges. Categories (type 4) are the
// containers we group INTO, not items we place, so they're excluded here.
// 0 = text, 2 = voice, 5 = announcement, 13 = stage, 15 = forum.
export const ORGANIZABLE_TYPES = [0, 2, 5, 13, 15] as const;
export const CATEGORY_TYPE = 4;

/** A guild channel as the dashboard needs it: enough to render the current
 * layout (position/parent) and feed the AI. */
export interface GuildChannelLite {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id: string | null;
}

// A proposed layout: ordered categories, each with ordered channels that
// reference EXISTING channel ids and carry a proposed (icon-prefixed) name.
export const OrganizePlanItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
});
export const OrganizePlanCategorySchema = z.object({
  name: z.string().min(1).max(100),
  channels: z.array(OrganizePlanItemSchema),
});
export const OrganizePlanSchema = z.object({
  categories: z.array(OrganizePlanCategorySchema).max(50),
});
export type OrganizePlanItem = z.infer<typeof OrganizePlanItemSchema>;
export type OrganizePlanCategory = z.infer<typeof OrganizePlanCategorySchema>;
export type OrganizePlan = z.infer<typeof OrganizePlanSchema>;

export function isVoiceType(type: number): boolean {
  return type === 2 || type === 13;
}

// One emoji "cluster": flag pairs, keycaps, or a pictographic base with any
// variation-selector / skin-tone / ZWJ-joined continuation.
const EMOJI_SEQ =
  /(?:\p{Regional_Indicator}\p{Regional_Indicator})|(?:[0-9#*]️?⃣)|(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|⃣)*)/gu;

/**
 * Force a name to carry AT MOST ONE leading emoji icon: keep the first emoji
 * found, strip every other emoji (a name that already had one plus the model's
 * added one would otherwise show two), and put the survivor at the front.
 * Names with no emoji are returned unchanged (no icon invented here).
 */
export function oneLeadingEmoji(name: string): string {
  const found = name.match(EMOJI_SEQ);
  const text = name.replace(EMOJI_SEQ, ' ').replace(/\s+/g, ' ').trim();
  if (!found || found.length === 0) return text;
  return text ? `${found[0]} ${text}` : found[0];
}

/** Normalize a proposed channel name: exactly one leading emoji (never more),
 * then Discord's own text rules. Discord lowercases text-channel names and
 * turns spaces into hyphens; voice/stage channels keep spaces and case. */
export function sanitizeChannelName(name: string, type: number): string {
  const single = oneLeadingEmoji(name).slice(0, 100);
  if (isVoiceType(type)) return single;
  // Text/announcement/forum: Discord's own normalization.
  return single.toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Harden a raw AI plan against a real guild: keep only existing organizable
 * channels, place each at most once, sanitize proposed names by the channel's
 * true type, drop empty categories, and sweep any channel the model forgot into
 * a trailing `otherLabel` category — so the plan always covers every channel
 * exactly once. Never trusts the model with ids or completeness.
 */
export function reconcileOrganizePlan(
  plan: OrganizePlan,
  channels: GuildChannelLite[],
  otherLabel: string,
): OrganizePlan {
  const byId = new Map(
    channels.filter((c) => (ORGANIZABLE_TYPES as readonly number[]).includes(c.type)).map((c) => [c.id, c]),
  );
  const used = new Set<string>();
  const categories = plan.categories
    .map((cat) => {
      // Single pass: check-and-claim each id atomically. A filter()+map() split
      // would run the whole filter first, so duplicate ids would both survive.
      const channels: OrganizePlanItem[] = [];
      for (const ch of cat.channels) {
        const c = byId.get(ch.id);
        if (!c || used.has(ch.id)) continue;
        used.add(ch.id);
        channels.push({ id: ch.id, name: sanitizeChannelName(ch.name || c.name, c.type) });
      }
      // Category names get the same one-emoji guarantee as channels.
      return { name: oneLeadingEmoji(cat.name).slice(0, 100), channels };
    })
    .filter((cat) => cat.channels.length > 0);

  const leftovers = [...byId.values()].filter((c) => !used.has(c.id));
  if (leftovers.length > 0) {
    // The fallback bucket earns an icon too (the one-icon rule applies to every
    // category). Default to a folder when the caller's label carries none.
    const label = oneLeadingEmoji(otherLabel).slice(0, 100) || 'Other';
    const name = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(label) ? label : `📁 ${label}`;
    categories.push({
      name,
      channels: leftovers.map((c) => ({ id: c.id, name: sanitizeChannelName(c.name, c.type) })),
    });
  }
  return { categories };
}
