# GuildList: Add-server button — Design

**Date:** 2026-07-19 · **Status:** approved (owner picked "button + plus tile")

## Goal

The "your servers" page (`/app`, `GuildList.tsx`) only shows guilds the bot is
already in. There is no way to invite the bot to another server from here —
users have to go back to the landing page. Add an obvious "add server" action.

## Design

Two entry points, both plain anchors to the public bot-invite URL
(`GET /api/meta` → `inviteUrl`, already used by the landing page), opening in a
new tab (`target="_blank" rel="noreferrer"`):

1. **Header button** — primary-styled button with a `Plus` icon in the title
   row, right of «سيرفراتك».
2. **Plus tile** — dashed-border card appended to the guild grid (also visible
   when the list is empty), same link.

Both render only once `/api/meta` has loaded (no `#` placeholder links).

New i18n key `guilds.add` in all six locales (ar/en/de/tr/fr/ru).

After the OAuth invite completes, the new guild appears in the list on the
next `/api/guilds` fetch — no extra refresh logic in scope.

## Out of scope

Auto-refreshing the guild list after the invite tab closes; linking the new
guild automatically; premium/link-limit changes.

## Testing

New `GuildList.test.tsx` (jsdom, fetch stubbed per endpoint, wrapped in
MemoryRouter + I18nProvider + ToastProvider + QueryClientProvider):
- header button and plus tile both point at the meta invite URL
- plus tile still renders when the user has zero guilds
