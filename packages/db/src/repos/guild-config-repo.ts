import { GuildConfigSchema, type GuildConfig } from '@gamebot/shared';
import { GuildConfigModel } from '../models.js';

interface GuildConfigDoc {
  guild_id: string;
  config: GuildConfig;
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const doc = await GuildConfigModel.findOne({ guild_id: guildId }).lean() as GuildConfigDoc | null;
  if (doc) return GuildConfigSchema.parse(doc.config);
  const config = GuildConfigSchema.parse({});
  await GuildConfigModel.updateOne(
    { guild_id: guildId },
    { $setOnInsert: { config } },
    { upsert: true },
  );
  return config;
}

export async function updateGuildConfig(guildId: string, patch: Record<string, unknown>): Promise<GuildConfig> {
  const current = await getGuildConfig(guildId);
  const merged = GuildConfigSchema.parse(deepMerge(current as unknown as Record<string, unknown>, patch));
  await GuildConfigModel.updateOne({ guild_id: guildId }, { $set: { config: merged } }, { upsert: true });
  return merged;
}
