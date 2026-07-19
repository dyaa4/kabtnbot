# Per-user bot-invite cap — Design

**Date:** 2026-07-19 · **Status:** approved (enforcement design confirmed by owner)

## Interpretation note (numbers)

The owner's answers on limits were garbled twice ("بريميوم فقط سيرفر واحد
والمجاني غير محدود... ام 9"). Read literally that grants premium LESS than
free, which contradicts the whole premium model. Interpreted as intended:
**free = 1 guild, premium = 9 guilds** (owner was undecided between 9 and
unlimited for premium; 9 chosen — a bounded cap is enforceable and matches
"مثلا 9" from the earlier answer). Both are single constants; trivial to
change if the owner corrects this.

## Goal

Any Discord user can currently invite the bot into unlimited guilds; only
guild LINKING is capped (free 1 / premium 3). Each guild costs quota and
compute. Cap how many guilds one user can ADD the bot to.

## Design

**Attribution (bot, `guildCreate`):** after the existing blocked-guild check,
read the guild's audit log (`BOT_ADD`, latest entries) and find the entry
whose target is the bot — its executor is the inviter. Store it on the
directory record (`invited_by`). Attribution is best-effort: no audit-log
permission, no entry, or any error → inviter stays unknown and the guild is
NEVER punished (fail-open).

**Enforcement (bot):** with a known inviter, count active directory records
(`left_at: null`, not this guild) already attributed to them. Limit:
`premium_active ? 9 : 1` (reuses the user-accounts collection). Over the
limit → post a short bilingual apology to the guild's system channel
(best-effort) and leave. `recordGuildLeave` runs via the existing
`guildDelete` handler.

**Invite URL:** add `VIEW_AUDIT_LOG` (1<<7) to the permissions integer in
`/api/meta`'s inviteUrl if not already present, so future invites can read
the audit log.

**Dashboard (web):** `/api/me/plan` gains `max_guilds` and
`invited_guild_count` (count of active attributed records). The guild-list
page shows the counter in the existing plan banner and disables both
add-server entry points when the count is at the limit (tooltip explains).
UI is advisory; the bot-side check is the real gate.

## Out of scope

Retroactive attribution of guilds the bot already sits in (unknown inviter →
uncounted, fail-open). Payment integration.

## Testing

- db: attribution upsert, active-count query, count excludes left guilds.
- bot: guildCreate handler — over-limit inviter → message + leave; unknown
  inviter → stays; under limit → stays and records attribution.
- web: plan endpoint fields; GuildList disables add buttons at the limit.
