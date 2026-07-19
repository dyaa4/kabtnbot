import { UserAccountModel } from '../models.js';
import { retryOnDupKey } from '../retry.js';

// Premium is per USER, not per guild: linking a guild to your account is what
// unlocks the paid dashboard features there. Free plan links one guild,
// premium links three.
export const FREE_LINK_LIMIT = 1;
export const PREMIUM_LINK_LIMIT = 3;
// Bot-INVITE cap (distinct from linking): how many guilds one user may add
// the bot to, enforced at join time via audit-log attribution.
export const FREE_GUILD_LIMIT = 1;
export const PREMIUM_GUILD_LIMIT = 9;

export interface UserPlan {
  premium: boolean;
  max_links: number;
  max_guilds: number;
  linked_guild_ids: string[];
}

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const doc = await UserAccountModel.findOne({ user_id: userId }).lean();
  const premium = doc?.premium_active ?? false;
  return {
    premium,
    max_links: premium ? PREMIUM_LINK_LIMIT : FREE_LINK_LIMIT,
    max_guilds: premium ? PREMIUM_GUILD_LIMIT : FREE_GUILD_LIMIT,
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
  // Ensure the account row exists first (idempotent) so the guarded write
  // below can be a pure match-or-reject — a guarded upsert would instead try
  // to INSERT when the array is full and collide on the unique user_id.
  await retryOnDupKey(() => UserAccountModel.updateOne(
    { user_id: userId },
    { $setOnInsert: { linked_guild_ids: [] }, $set: { updated_at: new Date() } },
    { upsert: true },
  ));
  // The limit is enforced in the WRITE filter, not just the read above: the
  // positional guard `linked_guild_ids.<max-1>: {$exists:false}` matches only
  // while the array still has room, so N concurrent link requests that all
  // passed the optimistic pre-check can't all commit — Mongo serializes the
  // updates and every write past the limit matches 0 docs. (TOCTOU fix.)
  const res = await UserAccountModel.updateOne(
    { user_id: userId, [`linked_guild_ids.${plan.max_links - 1}`]: { $exists: false } },
    { $addToSet: { linked_guild_ids: guildId }, $set: { updated_at: new Date() } },
  );
  // Nothing matched ⇒ the last slot filled between the pre-check and the write
  // (lost the race). Report the limit rather than silently overfilling.
  if (res.matchedCount === 0) return null;
  return getUserPlan(userId);
}

export async function unlinkGuild(userId: string, guildId: string): Promise<UserPlan> {
  await UserAccountModel.updateOne(
    { user_id: userId },
    { $pull: { linked_guild_ids: guildId }, $set: { updated_at: new Date() } },
  );
  return getUserPlan(userId);
}

/** Upserts the identity snapshot on every dashboard login, so the admin's
 * user list shows everyone who ever signed in. */
export async function recordUserLogin(userId: string, uname: string, avatar: string | null): Promise<void> {
  await retryOnDupKey(() => UserAccountModel.updateOne(
    { user_id: userId },
    { $set: { uname, avatar, last_login: new Date(), updated_at: new Date() } },
    { upsert: true },
  ));
}

export interface UserAccountSummary {
  user_id: string;
  uname: string;
  avatar: string | null;
  premium_active: boolean;
  blocked: boolean;
  linked_guild_ids: string[];
  last_login: string | null;
}

export async function listUserAccounts(limit = 200): Promise<UserAccountSummary[]> {
  const docs = await UserAccountModel.find({}).sort({ last_login: -1 }).limit(limit).lean();
  return docs.map((d) => ({
    user_id: d.user_id,
    uname: d.uname ?? '',
    avatar: d.avatar ?? null,
    premium_active: d.premium_active,
    blocked: d.blocked ?? false,
    linked_guild_ids: d.linked_guild_ids ?? [],
    last_login: d.last_login ? d.last_login.toISOString() : null,
  }));
}

/** Identity refresh WITHOUT touching last_login (admin-list enrichment). */
export async function updateUserIdentity(userId: string, uname: string, avatar: string | null): Promise<void> {
  await retryOnDupKey(() => UserAccountModel.updateOne(
    { user_id: userId },
    { $set: { uname, avatar, updated_at: new Date() } },
    { upsert: true },
  ));
}

export async function setUserBlocked(userId: string, blocked: boolean): Promise<void> {
  await retryOnDupKey(() => UserAccountModel.updateOne(
    { user_id: userId },
    { $set: { blocked, updated_at: new Date() } },
    { upsert: true },
  ));
}

export async function isUserBlocked(userId: string): Promise<boolean> {
  const doc = await UserAccountModel.findOne({ user_id: userId }).select('blocked').lean();
  return doc?.blocked ?? false;
}

/** Premium gate: a guild has premium features when ANY account links it. */
export async function isGuildLinked(guildId: string): Promise<boolean> {
  return (await UserAccountModel.exists({ linked_guild_ids: guildId })) !== null;
}

/** Quota gate: premium limits apply when a PREMIUM account links the guild. */
export async function isGuildPremium(guildId: string): Promise<boolean> {
  return (await UserAccountModel.exists({ linked_guild_ids: guildId, premium_active: true })) !== null;
}

/**
 * The premium account whose monthly pool this guild draws from. Quotas are
 * pooled PER ACCOUNT, not per guild — otherwise linking 3 guilds would
 * triple one subscription's budget. When several premium accounts link the
 * same guild the oldest account wins (stable pick, no double budget).
 */
export async function getPremiumLinker(guildId: string): Promise<string | null> {
  const doc = await UserAccountModel.findOne({ linked_guild_ids: guildId, premium_active: true })
    .sort({ _id: 1 })
    .select('user_id')
    .lean();
  return doc?.user_id ?? null;
}
