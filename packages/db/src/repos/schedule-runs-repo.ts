import { ScheduleRunModel } from '../models.js';
import { retryOnDupKey } from '../retry.js';

export interface ScheduleRun {
  at: Date;
  /** Executed runs so far — init stamps don't count. */
  count: number;
}

/**
 * Run bookkeeping per schedule key for one guild (missing = never
 * initialized). Key = flow id for the flow's base batch, `flowId:actionId`
 * for actions running on their own repeat interval.
 */
export async function getScheduleRuns(guildId: string): Promise<Map<string, ScheduleRun>> {
  const docs = await ScheduleRunModel.find({ guild_id: guildId }).lean();
  return new Map(docs.map((d) => [d.flow_id, { at: d.last_run_at, count: d.run_count ?? 0 }]));
}

/** Stamp a run. countRun=false for init stamps (enabling a schedule must not
 * consume one of its max_runs). */
export async function setScheduleRun(
  guildId: string,
  flowId: string,
  at: Date,
  countRun = false,
): Promise<void> {
  await retryOnDupKey(() => ScheduleRunModel.updateOne(
    { guild_id: guildId, flow_id: flowId },
    { $set: { last_run_at: at }, $inc: { run_count: countRun ? 1 : 0 } },
    { upsert: true },
  ));
}

/**
 * Drop the bookkeeping of one flow (base key + all `flowId:action` keys) —
 * called when its schedule config changes, so a new daily time takes effect
 * today and an edited max_runs starts counting from zero again.
 */
export async function resetScheduleRuns(guildId: string, flowId: string): Promise<void> {
  // Flow ids are usually UUIDs, but the schema allows any string — escape it.
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await ScheduleRunModel.deleteMany({
    guild_id: guildId,
    $or: [{ flow_id: flowId }, { flow_id: { $regex: `^${escaped}:` } }],
  });
}
