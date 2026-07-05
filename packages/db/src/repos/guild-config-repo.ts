import { GuildConfigSchema, type GuildConfig } from '@gamebot/shared';
import { GuildConfigModel } from '../models.js';

interface GuildConfigDoc {
  guild_id: string;
  config: GuildConfig;
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const defaults = GuildConfigSchema.parse({});
  try {
    const doc = await GuildConfigModel.findOneAndUpdate(
      { guild_id: guildId },
      { $setOnInsert: { config: defaults } },
      { upsert: true, new: true },
    ).lean() as GuildConfigDoc | null;
    return GuildConfigSchema.parse(doc?.config);
  } catch (err) {
    // Rare duplicate-key race on concurrent first access: the other writer won; read theirs.
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      const doc = await GuildConfigModel.findOne({ guild_id: guildId }).lean() as GuildConfigDoc | null;
      if (doc) return GuildConfigSchema.parse(doc.config);
    }
    throw err;
  }
}

/**
 * Read-only fetch: returns the stored config, or schema defaults if none exists,
 * WITHOUT creating a document (a plain findOne, no write). Use on hot paths that
 * read the config frequently so dashboard changes are picked up quickly without
 * a write per call.
 */
export async function getGuildConfigRead(guildId: string): Promise<GuildConfig> {
  const doc = (await GuildConfigModel.findOne({ guild_id: guildId }).lean()) as GuildConfigDoc | null;
  return GuildConfigSchema.parse(doc?.config ?? {});
}

export async function updateGuildConfig(guildId: string, patch: Record<string, unknown>): Promise<GuildConfig> {
  const current = await getGuildConfig(guildId);
  const merged = GuildConfigSchema.parse(deepMerge(current as unknown as Record<string, unknown>, patch));
  await GuildConfigModel.updateOne({ guild_id: guildId }, { $set: { config: merged } }, { upsert: true });
  return merged;
}
