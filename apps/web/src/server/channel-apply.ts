import {
  OrganizePlanSchema,
  reconcileOrganizePlan,
  CATEGORY_TYPE,
} from '@gamebot/shared';
import { saveOrganizeSnapshot, getOrganizeSnapshot, clearOrganizeSnapshot, hasOrganizeSnapshot } from '@gamebot/db';
import type { DiscordRest } from './discord-rest.js';
import { DiscordApiError } from './discord-rest.js';

export class InvalidPlanError extends Error {
  constructor() {
    super('INVALID_PLAN');
  }
}

// A prior apply is still undoable. Applying again would overwrite that snapshot
// with the ALREADY-organized layout, making the true original unrecoverable —
// so re-apply is refused until the user undoes (or the 24h snapshot expires).
export class SnapshotExistsError extends Error {
  constructor() {
    super('SNAPSHOT_EXISTS');
  }
}

export interface ApplyResult {
  categoriesCreated: number;
  channelsUpdated: number;
  failures: number;
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
      } catch (err) {
        // A missing-permission error is fatal and must surface (→ friendly 403),
        // not be silently counted like a one-off rate-limit hiccup.
        if (err instanceof DiscordApiError && err.status === 403) throw err;
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

  // Refuse re-apply while a previous apply is still undoable, so its snapshot
  // (the true original layout) is never overwritten by an organized one.
  if (await hasOrganizeSnapshot(guildId)) throw new SnapshotExistsError();

  const channels = await rest.listAllChannels(guildId);
  const plan = reconcileOrganizePlan(parsed.data, channels, otherLabel);
  if (plan.categories.length === 0) throw new InvalidPlanError();

  const byId = new Map(channels.map((c) => [c.id, c]));
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
  // which categories we created, so undo can fully reverse this. If the snapshot
  // write fails, roll back the just-created categories so they don't orphan with
  // no undo record.
  try {
    await saveOrganizeSnapshot(guildId, {
      channels: channels.map((c) => ({ id: c.id, name: c.name, position: c.position, parent_id: c.parent_id })),
      created_category_ids: createdCategoryIds,
    });
  } catch (err) {
    await Promise.all(createdCategoryIds.map((id) => rest.deleteChannel(id).catch(() => {})));
    throw err;
  }

  // Per-channel edits: reparent + rename. Discord's BULK positions endpoint
  // rejects changing more than one parent_id at once (code 40009), so reparents
  // MUST be individual PATCH /channels/:id calls. Reused categories are renamed
  // here too; created ones already carry their name.
  const edits: { id: string; patch: { name?: string; parent_id?: string | null } }[] = [
    ...catRenames.map((cr) => ({ id: cr.id, patch: { name: cr.name } })),
  ];
  // Positions are set in one bulk call AFTER reparenting — positions only, no
  // parent_id, so 40009 can't fire. Categories first (top-level), then channels.
  const positions: { id: string; position: number }[] = [];
  plan.categories.forEach((pc, ci) => {
    positions.push({ id: catIds[ci], position: ci });
    pc.channels.forEach((ch, idx) => {
      const cur = byId.get(ch.id)!;
      const patch: { name?: string; parent_id?: string | null } = {};
      if (cur.parent_id !== catIds[ci]) patch.parent_id = catIds[ci];
      if (cur.name !== ch.name) patch.name = ch.name;
      if (Object.keys(patch).length > 0) edits.push({ id: ch.id, patch });
      positions.push({ id: ch.id, position: idx });
    });
  });
  const failures = await mapLimit(edits, 4, (e) => rest.editChannel(e.id, e.patch));
  await rest.modifyChannelPositions(guildId, positions);

  return {
    categoriesCreated: createdCategoryIds.length,
    channelsUpdated: edits.length - failures,
    failures,
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

  // Reparent + rename back individually (bulk can't change many parents at once),
  // then restore order in one positions-only bulk call.
  const edits: { id: string; patch: { name?: string; parent_id?: string | null } }[] = [];
  const positions: { id: string; position: number }[] = [];
  for (const c of snap.channels) {
    const cur = curById.get(c.id);
    if (!cur) continue;
    const patch: { name?: string; parent_id?: string | null } = {};
    if (cur.parent_id !== c.parent_id) patch.parent_id = c.parent_id;
    if (cur.name !== c.name) patch.name = c.name;
    if (Object.keys(patch).length > 0) edits.push({ id: c.id, patch });
    positions.push({ id: c.id, position: c.position });
  }
  await mapLimit(edits, 4, (e) => rest.editChannel(e.id, e.patch));
  await rest.modifyChannelPositions(guildId, positions);

  // Delete the categories the apply created (now emptied of channels).
  await mapLimit(
    snap.created_category_ids.filter((id) => curById.has(id)),
    4,
    (id) => rest.deleteChannel(id),
  );

  await clearOrganizeSnapshot(guildId);
  return true;
}
