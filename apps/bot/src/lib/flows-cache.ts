import { getCommandFlows } from '@gamebot/db';
import type { GuildCommandFlows } from '@gamebot/shared';

// Same short-TTL pattern as config-cache.ts: flow edits in the dashboard apply
// within a few seconds while the per-utterance/per-message hot paths don't hit
// Mongo on every event.
const TTL_MS = 3_000;

const cache = new Map<string, { at: number; value: GuildCommandFlows }>();

export async function getCachedCommandFlows(guildId: string): Promise<GuildCommandFlows> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await getCommandFlows(guildId);
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

export function clearFlowsCache(): void {
  cache.clear();
}
