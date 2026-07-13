# Deployment (Railway)

The project runs as **two separate Railway services** from this one repo, because
a container can only run one long-lived process:

| Service | Dockerfile | Long-running process | Public domain |
|---|---|---|---|
| **Bot** | `Dockerfile` (default) | `node apps/bot/dist/index.js` | no (outbound only) |
| **Web** | `Dockerfile.web` | `node apps/web/dist/server/index.js` | yes |

Both connect to the **same MongoDB** — that shared DB is how the web dashboard
sees the bot's heartbeat ("online" badge). If the two use different
`MONGODB_URI` values, the dashboard always shows the bot offline.

Do **not** set a custom start command and do **not** add a `deploy:commands`
pre-step — each Dockerfile already starts the right process, and the bot
auto-registers its slash commands on startup.

---

## 1. Bot service

- **Settings → Build → Dockerfile Path:** `Dockerfile`
- **Settings → Deploy → Custom Start Command:** *(leave empty — uses the image CMD)*
- **No public domain needed** (the bot only makes outbound connections to Discord).
- **Variables:**
  - `DISCORD_TOKEN`
  - `DISCORD_CLIENT_ID`
  - `MONGODB_URI`
  - Text features (chat log, text triggers, text protection, /summarize) are **on by default** and need the
    **Message Content intent** enabled in the Discord Developer Portal. Without the intent the bot boots in a
    content-less fallback (those features stay dormant). Opt out of a feature with `ENABLE_CHAT_LOG=false`,
    `ENABLE_TEXT_COMMANDS=false`, `ENABLE_TEXT_PROTECTION=false` or `ENABLE_SUMMARY=false`.
  - `GROQ_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` *(for voice/AI; optional if unused)*
  - **Do NOT set `DISCORD_GUILD_ID`** → commands register **globally** (all servers).
    Set it to a single server id only for instant testing in that one server.

## 2. Web service

- **Settings → Build → Dockerfile Path:** `Dockerfile.web`
- **Settings → Deploy → Custom Start Command:** *(leave empty)*
- **Settings → Networking:** generate a domain (or add a custom one). The server
  listens on Railway's injected `$PORT`, so the domain routes automatically — no
  manual target port needed.
- **Variables:**
  - `DISCORD_CLIENT_ID`
  - `DISCORD_CLIENT_SECRET`
  - `DISCORD_TOKEN` *(the dashboard makes bot-token Discord REST calls)*
  - `MONGODB_URI` *(identical to the bot's)*
  - `SESSION_SECRET` *(random string, at least 32 characters)*
  - `WEB_BASE_URL=https://<your-domain>` — **no trailing slash.**
  - `ALERT_WEBHOOK_URL` *(optional: Discord webhook for offline/recovery alerts)*

### Discord OAuth redirect

In the Discord Developer Portal → your app → **OAuth2 → Redirects**, add exactly:

```
https://<your-domain>/auth/callback
```

It must match `WEB_BASE_URL` + `/auth/callback` character for character (a
trailing slash on `WEB_BASE_URL` would produce a rejected `//auth/callback`;
the server strips trailing slashes defensively, but keep the variable clean).

---

## MongoDB Atlas

Railway has no static outbound IP, so in **Atlas → Network Access** allow
`0.0.0.0/0` (access is still protected by the DB user/password in the URI + TLS).
Otherwise both services fail to connect with `ReplicaSetNoPrimary` /
"IP that isn't whitelisted".

## Inviting the bot

Use the invite link from the dashboard (`/api/meta` → `inviteUrl`). It includes
`scope=bot applications.commands` and the permissions the features need
(Manage Roles, Manage Messages, Moderate Members, Move Members, …). Inviting
without `applications.commands` means slash commands never appear in that server.
