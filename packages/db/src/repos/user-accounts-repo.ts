import { UserAccountModel } from '../models.js';
import { retryOnDupKey } from '../retry.js';

// Premium is per USER, not per guild: linking a guild to your account is what
// unlocks the paid dashboard features there. Free plan links one guild,
// premium links three.
export const FREE_LINK_LIMIT = 1;
export const PREMIUM_LINK_LIMIT = 3;

export interface UserPlan {
  premium: boolean;
  max_links: number;
  linked_guild_ids: string[];
}

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const doc = await UserAccountModel.findOne({ user_id: userId }).lean();
  const premium = doc?.premium_active ?? false;
  return {
    premium,
    max_links: premium ? PREMIUM_LINK_LIMIT : FREE_LINK_LIMIT,
    linked_guild_ids: doc?.linked_guild_ids ?? [],
  };
}

/** Super-admin grant (payment integration lands later). Downgrading below the
 * free limit keeps existing links — they only block NEW links. */
export async function setUserPremium(userId: string, active: boolean): Promise<void> {
  await retryOnDupKey(() => UserAccountModel.updateOne(
    { user_id: userId },
    { $set: { premium_active: active, updated_at: new Date() } },
    { upsert: true },
  ));
}

/** Links a guild to the user's plan. Returns the updated plan, or null when
 * the plan's link limit is already reached (linking again is idempotent). */
export async function linkGuild(userId: string, guildId: string): Promise<UserPlan | null> {
  const plan = await getUserPlan(userId);
  if (plan.linked_guild_ids.includes(guildId)) return plan;
  if (plan.linked_guild_ids.length >= plan.max_links) return null;
  await retryOnDupKey(() => UserAccountModel.updateOne(
    { user_id: userId },
    { $addToSet: { linked_guild_ids: guildId }, $set: { updated_at: new Date() } },
    { upsert: true },
  ));
  return getUserPlan(userId);
}

export async function unlinkGuild(userId: string, guildId: string): Promise<UserPlan> {
  await UserAccountModel.updateOne(
    { user_id: userId },
    { $pull: { linked_guild_ids: guildId }, $set: { updated_at: new Date() } },
  );
  return getUserPlan(userId);
}

/** Premium gate: a guild has premium features when ANY account links it. */
export async function isGuildLinked(guildId: string): Promise<boolean> {
  return (await UserAccountModel.exists({ linked_guild_ids: guildId })) !== null;
}
