# Dashboard tab restructure + premium gating batch — Design

**Date:** 2026-07-19 · **Status:** approved (11-point owner list + 3 clarifications)

## Owner requirements (as clarified)

1. Voice assistant premium-only — **bot AND dashboard** (owner picked "both").
2. Voice assistant gets its own tab.
3. "الإعدادات" renamed "الإعدادات العامة" (general settings).
4. New premium "تخصيص" (customize) tab holding the bot avatar/name editor.
5. Protection: voice moderation marked premium.
6. Welcome stays free. 7. Stats stay free. 8. Logs stay premium (already).
9. Overview shows whether the guild is premium-linked.
10. "Features" link in the DASHBOARD navbar (opens landing #features).
11. Landing feature cards get free/pro badges.

"Premium" for a guild = linked by any user account (`isGuildLinked`) or
super-admin session — identical to the existing `hasPremiumAccess` gates for
logs/flows. Payment integration unchanged (deferred).

## Design

**Server (web):**
- `hasPremiumAccess` moves from api.ts to guild-access.ts (exported) so
  bot-profile routes can share it.
- `GET /guilds/:id/info` gains `premiumLinked: boolean` (fresh `isGuildLinked`
  read, not statsCached — linking must reflect immediately).
- `PATCH /guilds/:id/config` rejects a body containing `voice` with 403
  PREMIUM_REQUIRED unless premium (general settings no longer send voice).
- `PATCH /guilds/:id/bot-profile` and `PUT …/bot-profile/avatar` gated the
  same way. GET stays open (read-only display).
- Protection PATCH is NOT server-gated: with /join premium-gated, voice
  moderation can never run on a free guild anyway; the UI disables the toggle.

**Bot:**
- `isGuildLinkedCached` added next to `isGuildPremiumCached` (60s TTL).
- `requireVoiceContext` (join/listen/speak) additionally requires the guild to
  be linked; otherwise replies with a localized upsell (`voicePremiumRequired`
  in all six bot languages). `/leave` is never gated.

**Web client:**
- Tabs: overview · voice (new) · commands · protection · welcome · stats ·
  voice-log · chat-log · customize (new) · settings (renamed general).
- `VoiceTab`: the voice sections moved out of SettingsTab (enable, wake word,
  TTS voice, follow-up, personality, allowed channels). Shows the standard
  premium upsell panel when the guild is not linked (client check via
  `usePremiumStatus`; the PATCH gate enforces server-side).
- `CustomizeTab`: BotProfileCard behind the same panel.
- `SettingsTab` keeps language, admin role, weekly summary only.
- `usePremiumStatus(guildId)`: combines `/info`.premiumLinked with
  `/api/admin/me`.isSuperAdmin.
- Overview server card: linked → blue Gem chip "بريميوم مفعّل"; not linked →
  neutral chip "الخطة المجانية" + hint to link from the servers page.
- Layout navbar gains a link to `/#features`.
- ProtectionTab: voice-moderation checkbox disabled + Pro pill when gated.

**Landing:** feature cards get tier badges — voice: Pro, bot profile
(customize): Pro; protection, stats, welcome: Free. Keys `landing.tier.*`.

## Testing

- api.test: config PATCH with `voice` → 403 without link, 200 with link;
  /info.premiumLinked; bot-profile PATCH 403 without link (assets/e2e tests
  updated to link first).
- bot: new voice-command test — unlinked guild → upsell reply, no join;
  linked → joins.
- client: VoiceTab test (moved voice assertions + upsell panel when free),
  SettingsTab test slimmed, GuildView renders new tabs, Overview badge.
