# Monthly quotas + voice strictly premium — Design

**Date:** 2026-07-19 · **Status:** approved by owner

## Owner decisions

- Daily quotas cost too much at the ceiling (~$160/mo per premium guild).
  Switch accounting from per-day to per-MONTH.
- Premium guilds: **600 listen minutes + 600 AI questions per month**
  (cost ceiling ≈ $7/month/guild).
- Free guilds: **zero voice** — the voice assistant requires a guild linked by
  a PREMIUM account specifically (`isGuildPremium`), not just any link.
  Free-account links keep unlocking the web features (logs, flows, customize).

## Design

**Accounting key:** usage stays in the same `Usage` collection; the quota
path simply writes month keys (`monthKey()` = `YYYY-MM`) instead of day keys.
`todayKey()` remains for stats snapshots and admin analytics (which keep
working — sums over coarser keys stay sums).

**Shared:** `PREMIUM_QUOTAS` → `{ listen_minutes_per_month: 600,
ai_questions_per_month: 600 }`. Guild-config quota fields renamed to
`*_per_month` with **default 0** — a free guild has no voice budget at all.
Existing DB docs' old field names are simply ignored (defaults apply); custom
per-guild overrides can be re-granted via config if ever needed.

**Bot:** quota helpers use `monthKey()`. `requireVoiceContext` gates on
`isGuildPremiumCached` (existing helper) instead of `isGuildLinkedCached`;
upsell strings reworded to "premium account" phrasing in all six languages.
`/settings` embed shows the monthly numbers.

**Web:** `/info` additionally returns `premiumActive` (`isGuildPremium`,
fresh read). The voice tab, protection voice-moderation toggles and the
config-PATCH `voice` gate switch to premiumActive (super-admin bypass kept);
customize/logs/flows stay on the linked gate. `/usage` uses `monthKey()` and
returns `*_per_month` limits; Overview bars read them and the labels say
"this month". The Overview badge now reflects premiumActive.

## Testing

- shared: monthKey shape, effectiveQuotas monthly names, free default 0.
- bot: /join denied on linked-but-free guild, allowed on premium-linked;
  quota consume writes month keys.
- web: /usage month accounting + renamed limits; voice PATCH 403 for a
  linked-but-free guild; VoiceTab upsell on premiumActive=false.
