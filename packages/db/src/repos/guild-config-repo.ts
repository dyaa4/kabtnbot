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

// Docs written before the language feature stored the then-default templates
// as literal Arabic strings; today '' means "use the localized template at
// send time". Mapping the exact legacy literals back to '' is lossless for
// Arabic guilds ('' renders the identical text) and lets welcome/farewell
// follow a later language switch instead of staying Arabic forever.
const LEGACY_WELCOME_DEFAULT = 'أهلاً {user} في {server}! 🎮';
const LEGACY_FAREWELL_DEFAULT = 'وداعاً {user} 👋';

function withoutLegacyDefaults(config: GuildConfig): GuildConfig {
  const { welcome } = config;
  if (welcome.message !== LEGACY_WELCOME_DEFAULT && welcome.farewell_message !== LEGACY_FAREWELL_DEFAULT) {
    return config;
  }
  return {
    ...config,
    welcome: {
      ...welcome,
      message: welcome.message === LEGACY_WELCOME_DEFAULT ? '' : welcome.message,
      farewell_message: welcome.farewell_message === LEGACY_FAREWELL_DEFAULT ? '' : welcome.farewell_message,
    },
  };
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const defaults = GuildConfigSchema.parse({});
  try {
    const doc = await GuildConfigModel.findOneAndUpdate(
      { guild_id: guildId },
      { $setOnInsert: { config: defaults } },
      { upsert: true, new: true },
    ).lean() as GuildConfigDoc | null;
    return withoutLegacyDefaults(GuildConfigSchema.parse(doc?.config));
  } catch (err) {
    // Rare duplicate-key race on concurrent first access: the other writer won; read theirs.
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      const doc = await GuildConfigModel.findOne({ guild_id: guildId }).lean() as GuildConfigDoc | null;
      if (doc) return withoutLegacyDefaults(GuildConfigSchema.parse(doc.config));
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
  return withoutLegacyDefaults(GuildConfigSchema.parse(doc?.config ?? {}));
}

// Flattens a patch into dotted Mongo paths ({voice: {enabled: true}} →
// {'config.voice.enabled': true}). Arrays and nulls are leaves ($set whole value).
function dottedPaths(patch: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, dottedPaths(v as Record<string, unknown>, `${prefix}${k}.`));
    } else {
      out[`${prefix}${k}`] = v;
    }
  }
  return out;
}

export async function updateGuildConfig(guildId: string, patch: Record<string, unknown>): Promise<GuildConfig> {
  const current = await getGuildConfig(guildId); // also materializes the doc for the $set below
  const merged = GuildConfigSchema.parse(deepMerge(current as unknown as Record<string, unknown>, patch));
  // $set only the patched leaves, not the whole merged document: two admins
  // saving different sections concurrently must not overwrite each other's
  // fields with the stale copy they read (read-modify-write race).
  const sets = dottedPaths(patch, 'config.');
  if (Object.keys(sets).length > 0) {
    await GuildConfigModel.updateOne({ guild_id: guildId }, { $set: sets });
  }
  return merged;
}

