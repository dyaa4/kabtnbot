import {
  OrganizePlanSchema,
  reconcileOrganizePlan,
  CATEGORY_TYPE,
} from '@gamebot/shared';
import { saveOrganizeSnapshot, getOrganizeSnapshot, clearOrganizeSnapshot } from '@gamebot/db';
import type { DiscordRest } from './discord-rest.js';

export class InvalidPlanError extends Error {
  constructor() {
    super('INVALID_PLAN');
  }
}

export interface ApplyResult {
  categoriesCreated: number;
  channelsMoved: number;
  renamed: number;
  renameFailures: number;
}

// Run `fn` over items with bounded concurrency; count (don't throw on) failures.
// Distinct channels sit in distinct Discord rate-limit buckets, so a one-shot
// rename of each channel stays fast and never trips the 2-per-10min per-channel
// name limit; the cap just avoids a burst.
async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<number> {
  let failures = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        await fn(item);
      } catch {
        failures++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return failures;
}

/**
 * Apply an approved layout to a guild: reuse existing categories (renaming them)
 * or create new ones, bulk-reorder+reparent every channel, then rename channels
 * whose name changed. Snapshots the previous layout first so undoOrganize can
 * restore it. Structural moves go through one bulk call (no rate limit); renames
 * are one-shot per channel. Never deletes existing categories.
 */
export async function applyOrganizePlan(
  rest: DiscordRest,
  guildId: string,
  rawPlan: unknown,
  otherLabel: string,
): Promise<ApplyResult> {
  const parsed = OrganizePlanSchema.safeParse(rawPlan);
  if (!parsed.success) throw new InvalidPlanError();

  const channels = await rest.listAllChannels(guildId);
  const plan = reconcileOrganizePlan(parsed.data, channels, otherLabel);
  if (plan.categories.length === 0) throw new InvalidPlanError();

  const nameById = new Map(channels.map((c) => [c.id, c.name]));
  const existingCats = channels.filter((c) => c.type === CATEGORY_TYPE).sort((a, b) => a.position - b.position);

  // Map each plan category to a real category id: reuse existing slots (renaming
  // them if needed), create extras only when the plan has more than exist.
  const createdCategoryIds: string[] = [];
  const catRenames: { id: string; name: string }[] = [];
  const catIds: string[] = [];
  for (let i = 0; i < plan.categories.length; i++) {
    const pc = plan.categories[i];
    if (i < existingCats.length) {
      catIds.push(existingCats[i].id);
      if (existingCats[i].name !== pc.name) catRenames.push({ id: existingCats[i].id, name: pc.name });
    } else {
      const created = await rest.createChannel(guildId, { name: pc.name, type: CATEGORY_TYPE });
      createdCategoryIds.push(created.id);
      catIds.push(created.id);
    }
  }

  // Snapshot the ORIGINAL layout (categories included) before reordering, plus
  // which categories we created, so undo can fully reverse this.
  await saveOrganizeSnapshot(guildId, {
    channels: channels.map((c) => ({ id: c.id, name: c.name, position: c.position, parent_id: c.parent_id })),
    created_category_ids: createdCategoryIds,
  });

  // One bulk call: categories to the top in plan order, each channel under its
  // category in plan order.
  const positions: { id: string; position: number; parent_id?: string | null }[] = [];
  plan.categories.forEach((pc, ci) => {
    positions.push({ id: catIds[ci], position: ci });
    pc.channels.forEach((ch, idx) => positions.push({ id: ch.id, position: idx, parent_id: catIds[ci] }));
  });
  await rest.modifyChannelPositions(guildId, positions);

  // Renames: reused categories + channels whose proposed name differs.
  const renames = [
    ...catRenames,
    ...plan.categories.flatMap((pc) =>
      pc.channels.filter((ch) => nameById.get(ch.id) !== ch.name).map((ch) => ({ id: ch.id, name: ch.name })),
    ),
  ];
  const renameFailures = await mapLimit(renames, 4, (r) => rest.editChannel(r.id, { name: r.name }));

  return {
    categoriesCreated: createdCategoryIds.length,
    channelsMoved: plan.categories.reduce((n, c) => n + c.channels.length, 0),
    renamed: renames.length - renameFailures,
    renameFailures,
  };
}

/** Reverse the last apply from the stored snapshot: restore positions/parents in
 * one bulk call, rename channels back, delete categories the apply created, then
 * drop the snapshot. Returns false when there is nothing to undo. */
export async function undoOrganize(rest: DiscordRest, guildId: string): Promise<boolean> {
  const snap = await getOrganizeSnapshot(guildId);
  if (!snap) return false;

  const current = await rest.listAllChannels(guildId);
  const curById = new Map(current.map((c) => [c.id, c]));

  const positions = snap.channels
    .filter((c) => curById.has(c.id))
    .map((c) => ({ id: c.id, position: c.position, parent_id: c.parent_id }));
  await rest.modifyChannelPositions(guildId, positions);

  const renames = snap.channels
    .filter((c) => curById.has(c.id) && curById.get(c.id)!.name !== c.name)
    .map((c) => ({ id: c.id, name: c.name }));
  await mapLimit(renames, 4, (r) => rest.editChannel(r.id, { name: r.name }));

  await mapLimit(
    snap.created_category_ids.filter((id) => curById.has(id)),
    4,
    (id) => rest.deleteChannel(id),
  );

  await clearOrganizeSnapshot(guildId);
  return true;
}
