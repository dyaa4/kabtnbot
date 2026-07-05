# Welcome Banner Upload + Bot Identity per Guild — Design

Date: 2026-07-06
Status: approved (chat), storage choice confirmed by user: MongoDB

## Goals

1. **Welcome tab UX**: admin uploads the banner image first (drag & drop / file picker);
   only then does the preview appear and the avatar placeholder is positioned purely by
   mouse (drag to move, wheel or corner grip to resize). The `banner_url` text field and
   the X/Y/size numeric inputs are removed from the UI.
2. **Bot identity per guild**: dashboard field to set the bot's display name (guild
   nickname) and image. Name is always per-guild. Image: try Discord's per-guild bot
   avatar (`PATCH /guilds/{id}/members/@me` with `avatar`); if the API does not apply it,
   fall back to the global bot avatar (`PATCH /users/@me`) and tell the user the change
   was global.

Out of scope (already true today, verified in code):
- Text moderation already listens to `messageCreate` in **all** channels.
- Per-guild config is already hot-reloaded (≤3 s TTL cache; welcome reads live from DB).

## Storage: uploaded images in MongoDB

Bot and web run as separate processes and share only MongoDB, so image bytes go into a
new collection (works even if the two processes later run on different hosts).

New model in `packages/db` (`GuildAssetModel`):

```
guild_id: string            // indexed, unique together with kind
kind: 'welcome_banner'      // extensible enum
content_type: string        // image/png | image/jpeg | image/webp | image/gif
data: Buffer                // capped at 8 MB (Mongo doc limit is 16 MB)
updated_at / created_at     // timestamps
```

Repo functions: `putGuildAsset`, `getGuildAsset`, `deleteGuildAsset`.

## Web API (all behind session + guild-access guard)

- `PUT /api/guilds/:guildId/assets/welcome-banner` — raw image body
  (`express.raw({ type: 'image/*', limit: '8mb' })`), magic-byte sniff for
  png/jpeg/webp/gif, upsert into `GuildAsset`.
- `GET /api/guilds/:guildId/assets/welcome-banner` — serves the stored bytes
  (dashboard preview), 404 when none.
- `DELETE /api/guilds/:guildId/assets/welcome-banner` — removes it.
- `GET /api/guilds/:guildId/bot-profile` — `{ nickname, avatar_url }` read via bot REST
  (`GET /guilds/{id}/members/{clientId}`; guild avatar CDN URL if set, else user avatar).
- `PATCH /api/guilds/:guildId/bot-profile` — `{ nickname: string|null }` (≤32 chars) →
  `PATCH /guilds/{id}/members/@me { nick }`. 403 from Discord maps to a friendly error.
- `PUT /api/guilds/:guildId/bot-profile/avatar` — raw image ≤ 8 MB → data URI →
  `PATCH /guilds/{id}/members/@me { avatar }`. If the response member has no guild
  avatar afterwards, fall back to `PATCH /users/@me { avatar }` and return
  `{ scope: 'global' }` (else `{ scope: 'guild' }`) so the UI can explain what happened.

`express.json()` ignores non-JSON content types, so the raw-body routes coexist with the
global JSON parser.

## Bot changes

- `renderWelcomeImage` accepts `banner: Buffer | string` (`loadImage` handles both).
- `guildMemberAdd`: prefer the uploaded `GuildAsset` banner; fall back to legacy
  `banner_url` (kept in the schema for existing guilds, no longer editable in the UI).

## Frontend

**WelcomeTab** (rework):
- No banner uploaded → dropzone card (click or drop a file). Upload happens immediately
  on selection (PUT), then the preview appears.
- Banner present → preview at the image's **natural aspect ratio** (fixes today's 16:9
  `object-cover` mismatch between preview and rendered image), avatar circle dragged
  with the mouse (existing pointer logic), resized via mouse wheel over the circle and a
  drag grip on its edge; arrow keys still work for accessibility.
- "Change image" / "Remove image" buttons; Save button persists position/message/channel
  as before. URL + numeric inputs deleted.

**SettingsTab**: new "Bot profile" card — nickname input + save, avatar preview +
file-picker upload (immediate), hint when the avatar was applied globally. New i18n keys
in `ar.json`/`en.json`.

## Testing

- Repo tests (mongodb-memory-server) for GuildAsset round-trip and 8 MB cap.
- Supertest route tests for upload validation (bad type, oversize, happy path) and
  bot-profile routes with a stubbed DiscordRest.
- Component tests for WelcomeTab (upload-first flow, drag updates position) and
  SettingsTab (bot profile save).
