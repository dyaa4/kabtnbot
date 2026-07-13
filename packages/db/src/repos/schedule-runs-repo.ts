import { ScheduleRunModel } from '../models.js';
import { retryOnDupKey } from '../retry.js';

/** last_run_at per flow id for one guild (missing = never initialized). */
export async function getScheduleRuns(guildId: string): Promise<Map<string, Date>> {
  const docs = await ScheduleRunModel.find({ guild_id: guildId }).lean();
  return new Map(docs.map((d) => [d.flow_id, d.last_run_at]));
}

export async function setScheduleRun(guildId: string, flowId: string, at: Date): Promise<void> {
  await retryOnDupKey(() => ScheduleRunModel.updateOne(
    { guild_id: guildId, flow_id: flowId },
    { $set: { last_run_at: at } },
    { upsert: true },
  ));
}
