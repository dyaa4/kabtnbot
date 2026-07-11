import { GuildCommandFlowsSchema, type GuildCommandFlows } from '@gamebot/shared';
import { CommandFlowsModel } from '../models.js';

/**
 * Read-only fetch: stored flows or schema defaults, WITHOUT creating a
 * document (bot hot path — mirrors getGuildConfigRead).
 */
export async function getCommandFlows(guildId: string): Promise<GuildCommandFlows> {
  const doc = await CommandFlowsModel.findOne({ guild_id: guildId }).lean();
  return GuildCommandFlowsSchema.parse(doc?.data ?? {});
}

/**
 * Full-document replace (the editor always saves the whole draft) — no
 * deep-merge, so array edits/deletes behave predictably. Throws ZodError on
 * invalid input.
 */
export async function putCommandFlows(guildId: string, data: unknown): Promise<GuildCommandFlows> {
  const parsed = GuildCommandFlowsSchema.parse(data);
  await CommandFlowsModel.updateOne(
    { guild_id: guildId },
    { $set: { data: parsed } },
    { upsert: true },
  );
  return parsed;
}
