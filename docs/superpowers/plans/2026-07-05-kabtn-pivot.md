# Kabtn Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all customs/matches features and rebuild Kabtn around four features — expanded voice assistant (admin voice-kick + comedic personality), a Protection feature (voice profanity moderation + text scam/link protection), member activity statistics, and a canvas welcome image.

**Architecture:** Same pnpm monorepo. Pure logic (message scanning, profanity normalization, activity scoring) lives in `@gamebot/shared` and is unit-tested there. Persistence is guild-scoped repos in `@gamebot/db` (`ActivityDaily` replaces `Match`/`Player`). The bot wires new gateway events (`messageCreate`, `messageReactionAdd`, `guildMemberAdd`) plus the existing voice pipeline for moderation/kick. The web app drops match tabs/routes and gains Protection + Welcome tabs and a reshaped activity Stats tab.

**Tech Stack:** TypeScript strict ESM (NodeNext, `.js` imports), discord.js ^14.26, mongoose ^8, zod ^3.24, @napi-rs/canvas (new), React 18 + Vite + Tailwind + react-hook-form + recharts, Vitest + Supertest + mongodb-memory-server + jsdom.

## Global Constraints

- Branch `v1`, working dir `D:\dev\gamebot`. Node >= 22.12, pnpm 9. TypeScript strict, ESM `"type":"module"` NodeNext, relative imports end in `.js`.
- All user-facing UI strings via i18n `t()` in both `ar.json` and `en.json` (identical key sets); Arabic default, RTL. Brand "Kabtn" inline is allowed.
- Every repo function is guild-scoped: `guildId` is the first parameter and injected into the query filter. Web guild routes come only through `requireSession` + `requireGuildAccess`; guild IDs never trusted from the body.
- Config PATCH semantics unchanged: strict Zod patch, only provided keys, arrays replaced, full `GuildConfigSchema` re-validation.
- Wake word default becomes `يا كابتن` (was `يا بوت`). Personality/protection/welcome all default OFF except `protection.voice_moderation` defaults true (only active when `protection.enabled`).
- Activity score formula (verbatim): `messages*1 + round(voice_seconds/60)*2 + reactions*1`.
- Protection profanity window: 1 hour sliding, in-memory per `(guildId,userId)`; first offense warns by name via TTS, second within the hour disconnects. Text protection deletes + warns (no timeout/kick escalation in this phase).
- Text protection requires the privileged **MessageContent** intent; it is OFF by default and documented for the operator. Activity message counting needs only `GuildMessages`/`GuildMessageReactions` (non-privileged).
- `@gamebot/web` consumes `@gamebot/db`'s compiled `dist/` — **rebuild db before running web tests** whenever db changes.
- Commit after every task. When deleting, also delete the corresponding test files.

---

## File Structure (target state)

- `packages/shared/src/`: `guild-config.ts` (pivoted schema), `quotas.ts` (unchanged), `activity.ts` (new: `activityScore`), `moderation.ts` (new: `normalizeText`, `matchesProfanity`, `scanMessage`), `index.ts`. **Deleted:** `teams.ts` + `teams.test.ts`.
- `packages/db/src/`: `models.ts` (drop Match/Player, add `ActivityDailyModel`), `repos/activity-repo.ts` (new), `repos/guild-config-repo.ts`/`usage-repo.ts`/`analytics-repo.ts` (kept), `index.ts`. **Deleted:** `repos/match-repo.ts`, `repos/player-repo.ts` + their tests in `repos.test.ts`.
- `apps/bot/src/`: **Deleted:** `commands/{custom,leaderboard,profile}.ts`, `modules/customs/**`. **New:** `events/activity.ts`, `events/guildMemberAdd.ts`, `modules/protection/{voice-mod,text-mod}.ts`, `modules/voice-ai/kick.ts`, `lib/welcome-image.ts`. **Modified:** `client.ts` (intents), `commands/index.ts`, `commands/settings.ts`, `modules/voice-ai/router.ts` + `listen.ts`, `events/ready.ts`, `lib/strings.ts`.
- `apps/web/src/`: **Deleted:** `client/components/{MatchesTab,LeaderboardTab}.tsx`. **Modified:** `server/routes/api.ts` (drop match routes, reshape stats), `server/discord-rest.ts` + `testing/fake-rest.ts`, `client/pages/GuildView.tsx`, `client/components/{StatsTab,SettingsTab}.tsx`, `client/pages/Landing.tsx`, locales. **New:** `client/components/{ProtectionTab,WelcomeTab}.tsx`.

---

### Task 1: Remove customs from shared + db

**Files:**
- Delete: `packages/shared/src/teams.ts`, `packages/shared/src/teams.test.ts`, `packages/db/src/repos/match-repo.ts`, `packages/db/src/repos/player-repo.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/guild-config.ts` (types only here), `packages/db/src/index.ts`, `packages/db/src/repos/repos.test.ts`, `packages/db/src/models.ts`, `packages/db/src/models.test.ts`

**Interfaces:**
- Produces: shared no longer exports `splitTeams`/`RankedPlayer`/`BalanceMode`/`MatchStatus`/`TeamKey`; db no longer exports Match/Player models or their repo fns. `GuildConfigSchema` unchanged in THIS task (pivoted in Task 3).

- [ ] **Step 1: Delete team logic + match/player repos and their tests**

```bash
git rm packages/shared/src/teams.ts packages/shared/src/teams.test.ts \
       packages/db/src/repos/match-repo.ts packages/db/src/repos/player-repo.ts
```

- [ ] **Step 2: Remove exports**

`packages/shared/src/index.ts` — delete the line `export * from './teams.js';` (keep guild-config + quotas exports).

In `packages/shared/src/guild-config.ts`, delete the now-unused type aliases lines 5-7:
```ts
export type BalanceMode = 'random' | 'balanced';
export type MatchStatus = 'lobby' | 'in_progress' | 'completed' | 'cancelled';
export type TeamKey = 'a' | 'b';
```

`packages/db/src/index.ts` — delete lines 5-6:
```ts
export * from './repos/player-repo.js';
export * from './repos/match-repo.js';
```

- [ ] **Step 3: Drop Match/Player models**

In `packages/db/src/models.ts`, delete the `matchSchema`/`MatchDoc`/`MatchModel` block, the `playerSchema`/`PlayerDoc`/`PlayerModel` block, and their exports. Keep `GuildConfigModel`, `UsageModel`, `MemberSnapshotModel`, `connectDb`'s model list, and the `mongoose.models.X ??` guards for the survivors.

- [ ] **Step 4: Prune tests referencing removed code**

In `packages/db/src/models.test.ts` delete any `describe`/`it` blocks that create `MatchModel`/`PlayerModel`. In `packages/db/src/repos/repos.test.ts` delete every block importing/using the match or player repos (the whole file may reduce to guild-config + usage coverage; if it becomes empty, `git rm` it). Do NOT touch `analytics-repo.test.ts`.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @gamebot/shared build && pnpm --filter @gamebot/shared test && pnpm --filter @gamebot/db build && pnpm --filter @gamebot/db test`
Expected: both build clean; remaining tests pass (no references to deleted symbols).

```bash
git add -A
git commit -m "refactor: remove customs team logic and match/player persistence"
```

---

### Task 2: Remove customs from the bot

**Files:**
- Delete: `apps/bot/src/commands/custom.ts`, `apps/bot/src/commands/leaderboard.ts`, `apps/bot/src/commands/profile.ts`, `apps/bot/src/modules/customs/` (all: `lobby.ts`, `start.ts`, `result.ts`, `embeds.ts`, `embeds.test.ts`)
- Modify: `apps/bot/src/commands/index.ts`, `apps/bot/src/modules/voice-ai/router.ts`, `apps/bot/src/modules/voice-ai/router.test.ts`, `apps/bot/src/events/ready.ts`

**Interfaces:**
- Consumes: none new.
- Produces: bot command list = `[pingCommand, joinCommand, leaveCommand, speakCommand, askCommand, chatCommand, settingsCommand]`; voice router no longer has a shuffle/teams branch; `ready.ts` no longer schedules match cleanup.

- [ ] **Step 1: Delete files**

```bash
git rm apps/bot/src/commands/custom.ts apps/bot/src/commands/leaderboard.ts apps/bot/src/commands/profile.ts
git rm -r apps/bot/src/modules/customs
```

- [ ] **Step 2: Update command registry**

Replace `apps/bot/src/commands/index.ts` imports + `all` array so it reads:
```ts
import { pingCommand } from './ping.js';
import { joinCommand, leaveCommand, speakCommand } from './voice.js';
import { askCommand, chatCommand } from './ask.js';
import { settingsCommand } from './settings.js';
// ... Command interface unchanged ...
  const all: Command[] = [pingCommand, joinCommand, leaveCommand, speakCommand, askCommand, chatCommand, settingsCommand];
```

- [ ] **Step 3: Strip the teams branch from the voice router**

In `apps/bot/src/modules/voice-ai/router.ts`: remove the `وزع/قسم/shuffle` regex branch, the `quickShuffle` helper, and any `import` of `startMatchCore`/`getActiveMatch`/`splitTeams`/`getPointsMap`. Keep leave/stop/help/ping/say(`قل`)/AI branches. In `router.test.ts`: delete the quick-shuffle test; keep the ping/help tests (adjust the mock so it no longer needs `getActiveMatch`/`getPointsMap`).

- [ ] **Step 4: Remove match cleanup from ready.ts**

In `apps/bot/src/events/ready.ts`: delete the `closeExpiredMatches` import, its startup call, and the hourly `setInterval`. Keep the `recordSnapshots` startup + 6h interval and the `clientReady` login log.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @gamebot/bot test && pnpm --filter @gamebot/bot build`
Expected: green (router tests reduced), clean compile.

```bash
git add -A
git commit -m "refactor: remove customs commands and voice team-shuffle from the bot"
```

---

### Task 3: Pivot `GuildConfigSchema`

**Files:**
- Modify: `packages/shared/src/guild-config.ts`
- Test: `packages/shared/src/guild-config.test.ts`

**Interfaces:**
- Produces: `GuildConfig` with NEW shape — top-level `admin_role_id: string | null`; `voice` gains `personality_enabled: boolean`; new `protection` and `welcome` objects; `customs` removed. `quotas`/`premium`/`language` unchanged. Wake word default `يا كابتن`.

- [ ] **Step 1: Write failing test**

Replace the customs-default test in `guild-config.test.ts` and add:
```ts
  it('has the pivoted default shape', () => {
    const c = GuildConfigSchema.parse({});
    expect(c.admin_role_id).toBeNull();
    expect(c.voice.wake_word).toBe('يا كابتن');
    expect(c.voice.personality_enabled).toBe(false);
    expect(c.protection).toEqual({
      enabled: false,
      voice_moderation: true,
      text_protection: false,
      custom_words: [],
      allowed_domains: [],
      log_channel_id: null,
    });
    expect(c.welcome).toEqual({
      enabled: false,
      channel_id: null,
      message: 'أهلاً {user} في {server}! 🎮',
      banner_url: null,
      avatar_x: 0.5,
      avatar_y: 0.4,
      avatar_size: 0.25,
      show_name: true,
    });
    expect('customs' in c).toBe(false);
  });
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/shared test`.

- [ ] **Step 3: Implement the pivoted schema**

Replace the `GuildConfigSchema` object body (keep `language`, `quotas`, `premium` exactly as they are):
```ts
export const GuildConfigSchema = z.object({
  language: z.literal('ar').default('ar'),
  admin_role_id: z.string().nullable().default(null),
  voice: z
    .object({
      enabled: z.boolean().default(true),
      wake_word: z.string().min(2).max(30).default('يا كابتن'),
      dialect: z.enum(DIALECTS).default('gulf'),
      allowed_channel_ids: z.array(z.string()).default([]),
      personality_enabled: z.boolean().default(false),
    })
    .default({}),
  protection: z
    .object({
      enabled: z.boolean().default(false),
      voice_moderation: z.boolean().default(true),
      text_protection: z.boolean().default(false),
      custom_words: z.array(z.string()).max(200).default([]),
      allowed_domains: z.array(z.string()).max(200).default([]),
      log_channel_id: z.string().nullable().default(null),
    })
    .default({}),
  welcome: z
    .object({
      enabled: z.boolean().default(false),
      channel_id: z.string().nullable().default(null),
      message: z.string().max(500).default('أهلاً {user} في {server}! 🎮'),
      banner_url: z.string().url().nullable().default(null),
      avatar_x: z.number().min(0).max(1).default(0.5),
      avatar_y: z.number().min(0).max(1).default(0.4),
      avatar_size: z.number().min(0.05).max(0.6).default(0.25),
      show_name: z.boolean().default(true),
    })
    .default({}),
  quotas: z
    .object({
      listen_minutes_per_day: z.number().int().positive().default(60),
      ai_questions_per_day: z.number().int().positive().default(50),
    })
    .default({}),
  premium: z
    .object({
      active: z.boolean().default(false),
      listen_minutes_override: z.number().int().positive().nullable().default(null),
      ai_questions_override: z.number().int().positive().nullable().default(null),
    })
    .default({}),
});
```

- [ ] **Step 4: Run to verify PASS** — `pnpm --filter @gamebot/shared build && pnpm --filter @gamebot/shared test`.

- [ ] **Step 5: Commit** — `git commit -am "feat(shared): pivot GuildConfig to admin_role_id + protection + welcome"`

---

### Task 4: `moderation.ts` — profanity matching + `scanMessage`

**Files:**
- Create: `packages/shared/src/moderation.ts`, `packages/shared/src/moderation.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `normalizeText(s: string): string` — lowercase, strip Arabic diacritics, collapse elongations (3+ repeats → 1), collapse whitespace.
  - `matchesProfanity(text: string, customWords: string[]): boolean` — word-boundary-ish match against a built-in AR+EN list plus custom words, on normalized text.
  - `scanMessage(content: string, opts: { customWords: string[]; allowedDomains: string[] }): { blocked: boolean; reason: 'scam' | 'invite' | 'shortener' | 'word' | null }` — pure, no side effects.

- [ ] **Step 1: Write failing tests**

`packages/shared/src/moderation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeText, matchesProfanity, scanMessage } from './moderation.js';

describe('normalizeText', () => {
  it('lowercases, strips diacritics, collapses elongation', () => {
    expect(normalizeText('HELLOOOO')).toBe('hello');
    expect(normalizeText('كلْمَة')).toBe('كلمة');
  });
});

describe('matchesProfanity', () => {
  it('matches a built-in bad word and a custom word, ignores clean text', () => {
    expect(matchesProfanity('you are an idiot', [])).toBe(true); // 'idiot' built-in
    expect(matchesProfanity('مرحبا يا شباب', [])).toBe(false);
    expect(matchesProfanity('this is badcustom', ['badcustom'])).toBe(true);
  });
  it('sees through simple elongation obfuscation', () => {
    expect(matchesProfanity('idioooot', [])).toBe(true);
  });
});

describe('scanMessage', () => {
  it('blocks known nitro/steam scam phrasing with a link', () => {
    expect(scanMessage('free nitro here http://d1scord-nitro.ru/x', { customWords: [], allowedDomains: [] }).blocked).toBe(true);
  });
  it('blocks foreign discord invites', () => {
    expect(scanMessage('join discord.gg/abc123', { customWords: [], allowedDomains: [] }).reason).toBe('invite');
  });
  it('blocks url shorteners', () => {
    expect(scanMessage('look bit.ly/xyz', { customWords: [], allowedDomains: [] }).reason).toBe('shortener');
  });
  it('passes ordinary links (youtube) and clean text', () => {
    expect(scanMessage('watch https://youtube.com/watch?v=1', { customWords: [], allowedDomains: [] }).blocked).toBe(false);
    expect(scanMessage('gg wp everyone', { customWords: [], allowedDomains: [] }).blocked).toBe(false);
  });
  it('passes a link whose domain is admin-allowed', () => {
    expect(scanMessage('my site shop.example.com/a', { customWords: [], allowedDomains: ['shop.example.com'] }).blocked).toBe(false);
  });
  it('blocks an admin custom word', () => {
    expect(scanMessage('this is spamword', { customWords: ['spamword'], allowedDomains: [] }).reason).toBe('word');
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/shared test`.

- [ ] **Step 3: Implement**

`packages/shared/src/moderation.ts`:
```ts
const BUILTIN_PROFANITY = [
  // English (kept intentionally mild in source; extend as needed)
  'idiot', 'stupid', 'moron', 'bastard', 'asshole',
  // Arabic (common insults)
  'حيوان', 'غبي', 'كلب', 'حقير', 'وسخ',
];

const SHORTENERS = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd', 'cutt.ly', 'rb.gy'];
const SCAM_DOMAIN_HINTS = ['d1scord', 'discordnitro', 'discordgift', 'steamcommunity-', 'steamgift', 'free-nitro'];
const SCAM_PHRASES = [/free\s+nitro/i, /steam\s+gift/i, /nitro\s+giveaway/i, /claim\s+your\s+(free\s+)?nitro/i];
const URL_RE = /\bhttps?:\/\/[^\s]+|\b[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/gi;
const INVITE_RE = /\b(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-z0-9-]+/i;

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '') // Arabic diacritics
    .replace(/(.)\1{2,}/g, '$1') // 3+ repeats → 1
    .replace(/\s+/g, ' ')
    .trim();
}

function domainOf(token: string): string | null {
  const m = token.match(/^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : null;
}

export function matchesProfanity(text: string, customWords: string[]): boolean {
  const n = normalizeText(text);
  const words = [...BUILTIN_PROFANITY, ...customWords.map((w) => w.toLowerCase())];
  return words.some((w) => {
    const nw = normalizeText(w);
    if (!nw) return false;
    return new RegExp(`(^|[^\\p{L}])${escapeRe(nw)}([^\\p{L}]|$)`, 'u').test(` ${n} `);
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scanMessage(
  content: string,
  opts: { customWords: string[]; allowedDomains: string[] },
): { blocked: boolean; reason: 'scam' | 'invite' | 'shortener' | 'word' | null } {
  const allowed = new Set(opts.allowedDomains.map((d) => d.toLowerCase().replace(/^www\./, '')));

  if (INVITE_RE.test(content)) return { blocked: true, reason: 'invite' };
  if (SCAM_PHRASES.some((re) => re.test(content))) return { blocked: true, reason: 'scam' };

  const urls = content.match(URL_RE) ?? [];
  for (const url of urls) {
    const domain = domainOf(url);
    if (!domain || allowed.has(domain)) continue;
    if (SHORTENERS.includes(domain)) return { blocked: true, reason: 'shortener' };
    if (SCAM_DOMAIN_HINTS.some((h) => domain.includes(h))) return { blocked: true, reason: 'scam' };
  }

  if (matchesProfanity(content, opts.customWords)) return { blocked: true, reason: 'word' };
  return { blocked: false, reason: null };
}
```

Append to `packages/shared/src/index.ts`: `export * from './moderation.js';`

- [ ] **Step 4: Run to verify PASS** — `pnpm --filter @gamebot/shared build && pnpm --filter @gamebot/shared test`.

- [ ] **Step 5: Commit** — `git commit -am "feat(shared): moderation — profanity match + scanMessage"`

---

### Task 5: `activity.ts` — `activityScore`

**Files:**
- Create: `packages/shared/src/activity.ts`, `packages/shared/src/activity.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `interface ActivityCounts { messages: number; voice_seconds: number; reactions: number }`; `activityScore(c: ActivityCounts): number` = `messages + round(voice_seconds/60)*2 + reactions`.

- [ ] **Step 1: Write failing test**

`packages/shared/src/activity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { activityScore } from './activity.js';

describe('activityScore', () => {
  it('weights voice minutes double, rounds seconds to minutes', () => {
    expect(activityScore({ messages: 10, voice_seconds: 300, reactions: 4 })).toBe(10 + 5 * 2 + 4); // 24
    expect(activityScore({ messages: 0, voice_seconds: 89, reactions: 0 })).toBe(2); // round(89/60)=1 → *2
  });
  it('is zero for no activity', () => {
    expect(activityScore({ messages: 0, voice_seconds: 0, reactions: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/shared test`.

- [ ] **Step 3: Implement**

`packages/shared/src/activity.ts`:
```ts
export interface ActivityCounts {
  messages: number;
  voice_seconds: number;
  reactions: number;
}

/** Composite activity score: messages*1 + minutes*2 + reactions*1. */
export function activityScore(c: ActivityCounts): number {
  return c.messages + Math.round(c.voice_seconds / 60) * 2 + c.reactions;
}
```

Append to `packages/shared/src/index.ts`: `export * from './activity.js';`

- [ ] **Step 4: Run to verify PASS** — `pnpm --filter @gamebot/shared build && pnpm --filter @gamebot/shared test`.

- [ ] **Step 5: Commit** — `git commit -am "feat(shared): activityScore composite metric"`

---

### Task 6: `ActivityDaily` model + `activity-repo`

**Files:**
- Modify: `packages/db/src/models.ts`, `packages/db/src/index.ts`
- Create: `packages/db/src/repos/activity-repo.ts`
- Test: `packages/db/src/repos/activity-repo.test.ts`

**Interfaces:**
- Consumes: `activityScore` from `@gamebot/shared`.
- Produces:
  - `ActivityDailyModel` — compound unique `(guild_id, user_id, date)`, fields `messages`/`voice_seconds`/`reactions` (default 0), TTL 120d on `created_at`.
  - `recordMessage(guildId, userId, dateKey)`, `recordReaction(guildId, userId, dateKey)`, `addVoiceSeconds(guildId, userId, dateKey, seconds)` — upsert `$inc`.
  - `topActive(guildId, days, limit=5): Promise<{ user_id: string; messages: number; voice_seconds: number; reactions: number; score: number }[]>` — aggregate sums over the window (window = `today-days+1 .. today`, UTC), score computed and sorted desc.
  - `activityDaily(guildId, days): Promise<{ date: string; messages: number; voice_seconds: number; reactions: number }[]>` — per-day rows summed across users, ascending.

- [ ] **Step 1: Write failing tests**

`packages/db/src/repos/activity-repo.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../connect.js';
import { recordMessage, recordReaction, addVoiceSeconds, topActive, activityDaily } from './activity-repo.js';

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
});
afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

const today = new Date().toISOString().slice(0, 10);

describe('activity-repo', () => {
  it('accumulates and ranks by composite score, guild-scoped', async () => {
    await recordMessage('gA', 'u1', today);
    await recordMessage('gA', 'u1', today);
    await addVoiceSeconds('gA', 'u1', today, 600); // 10 min → 20
    await recordReaction('gA', 'u2', today);
    await addVoiceSeconds('gA', 'u2', today, 60); // 1 min → 2
    // u1 score = 2 msgs + 20 + 0 = 22 ; u2 = 0 + 2 + 1 = 3
    const top = await topActive('gA', 7, 5);
    expect(top[0].user_id).toBe('u1');
    expect(top[0].score).toBe(22);
    expect(top[1].user_id).toBe('u2');
    // isolation
    expect(await topActive('gB', 7, 5)).toEqual([]);
  });

  it('activityDaily returns a summed row for the day', async () => {
    const rows = await activityDaily('gA', 7);
    const todays = rows.find((r) => r.date === today)!;
    expect(todays.messages).toBe(2);
    expect(todays.voice_seconds).toBe(660);
    expect(todays.reactions).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/db test`.

- [ ] **Step 3: Implement model**

In `packages/db/src/models.ts` add (mirroring the existing `UsageModel`/`MemberSnapshotModel` patterns):
```ts
export interface ActivityDailyDoc {
  guild_id: string;
  user_id: string;
  date: string; // UTC YYYY-MM-DD
  messages: number;
  voice_seconds: number;
  reactions: number;
  created_at: Date;
}

const activityDailySchema = new Schema<ActivityDailyDoc>({
  guild_id: { type: String, required: true },
  user_id: { type: String, required: true },
  date: { type: String, required: true },
  messages: { type: Number, default: 0 },
  voice_seconds: { type: Number, default: 0 },
  reactions: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now, expires: '120d' },
});
activityDailySchema.index({ guild_id: 1, user_id: 1, date: 1 }, { unique: true });
activityDailySchema.index({ guild_id: 1, date: 1 });

export const ActivityDailyModel =
  (mongoose.models.ActivityDaily as mongoose.Model<ActivityDailyDoc>) ??
  mongoose.model<ActivityDailyDoc>('ActivityDaily', activityDailySchema);
```

- [ ] **Step 4: Implement repo**

`packages/db/src/repos/activity-repo.ts`:
```ts
import { activityScore } from '@gamebot/shared';
import { ActivityDailyModel } from '../models.js';

function cutoffKey(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function bump(guildId: string, userId: string, dateKey: string, field: 'messages' | 'reactions' | 'voice_seconds', n: number): Promise<void> {
  await ActivityDailyModel.updateOne(
    { guild_id: guildId, user_id: userId, date: dateKey },
    { $inc: { [field]: n } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

export const recordMessage = (g: string, u: string, d: string) => bump(g, u, d, 'messages', 1);
export const recordReaction = (g: string, u: string, d: string) => bump(g, u, d, 'reactions', 1);
export const addVoiceSeconds = (g: string, u: string, d: string, s: number) =>
  s > 0 ? bump(g, u, d, 'voice_seconds', Math.round(s)) : Promise.resolve();

export async function topActive(
  guildId: string,
  days: number,
  limit = 5,
): Promise<{ user_id: string; messages: number; voice_seconds: number; reactions: number; score: number }[]> {
  const rows = await ActivityDailyModel.aggregate<{ _id: string; messages: number; voice_seconds: number; reactions: number }>([
    { $match: { guild_id: guildId, date: { $gte: cutoffKey(days) } } },
    { $group: { _id: '$user_id', messages: { $sum: '$messages' }, voice_seconds: { $sum: '$voice_seconds' }, reactions: { $sum: '$reactions' } } },
  ]);
  return rows
    .map((r) => ({ user_id: r._id, messages: r.messages, voice_seconds: r.voice_seconds, reactions: r.reactions, score: activityScore(r) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function activityDaily(
  guildId: string,
  days: number,
): Promise<{ date: string; messages: number; voice_seconds: number; reactions: number }[]> {
  const rows = await ActivityDailyModel.aggregate<{ _id: string; messages: number; voice_seconds: number; reactions: number }>([
    { $match: { guild_id: guildId, date: { $gte: cutoffKey(days) } } },
    { $group: { _id: '$date', messages: { $sum: '$messages' }, voice_seconds: { $sum: '$voice_seconds' }, reactions: { $sum: '$reactions' } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, messages: r.messages, voice_seconds: r.voice_seconds, reactions: r.reactions }));
}
```

Append to `packages/db/src/index.ts`: `export * from './repos/activity-repo.js';`

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @gamebot/db build && pnpm --filter @gamebot/db test`
Expected: activity tests pass.

```bash
git add -A
git commit -m "feat(db): ActivityDaily model and activity-repo with composite ranking"
```

---

### Task 7: Bot intents + activity tracking events

**Files:**
- Modify: `apps/bot/src/client.ts`, `apps/bot/src/index.ts`
- Create: `apps/bot/src/events/activity.ts`
- Test: `apps/bot/src/events/activity.test.ts`

**Interfaces:**
- Consumes: `recordMessage`/`recordReaction`/`addVoiceSeconds` (Task 6), `getGuildConfig` (existing), `todayKey` (`@gamebot/shared`).
- Produces: `registerActivityTracking(client: Client): void` wiring `messageCreate` (non-bot, guild → recordMessage), `messageReactionAdd` (non-bot → recordReaction), `voiceStateUpdate` (track join time in a Map keyed by `guildId:userId`, on leave/move add elapsed seconds). Exposes `voiceJoinTimes` Map and a pure `elapsedSeconds(prevMs, nowMs)` for testing; because `Date.now()` is used, inject a `now` param defaulting to `Date.now`.

- [ ] **Step 1: Add intents**

`apps/bot/src/client.ts`:
```ts
import { Client, GatewayIntentBits } from 'discord.js';

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent, // needed only when text protection is enabled; harmless otherwise
    ],
  });
}
```
(Note in the file with a comment: MessageContent is privileged — must be enabled in the Developer Portal; documented in README.)

- [ ] **Step 2: Write failing test for the pure part**

`apps/bot/src/events/activity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { elapsedSeconds } from './activity.js';

describe('elapsedSeconds', () => {
  it('computes whole seconds between two epoch millis', () => {
    expect(elapsedSeconds(1_000_000, 1_090_000)).toBe(90);
  });
  it('never returns negative', () => {
    expect(elapsedSeconds(2_000, 1_000)).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify FAIL** — `pnpm --filter @gamebot/bot test`.

- [ ] **Step 4: Implement**

`apps/bot/src/events/activity.ts`:
```ts
import type { Client } from 'discord.js';
import { recordMessage, recordReaction, addVoiceSeconds } from '@gamebot/db';
import { todayKey } from '@gamebot/shared';

export function elapsedSeconds(prevMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - prevMs) / 1000));
}

/** guildId:userId → epoch ms when the user (re)entered a voice channel. */
export const voiceJoinTimes = new Map<string, number>();

export function registerActivityTracking(client: Client, now: () => number = Date.now): void {
  client.on('messageCreate', (msg) => {
    if (!msg.guildId || msg.author.bot) return;
    void recordMessage(msg.guildId, msg.author.id, todayKey()).catch((e) => console.error('[activity] msg:', e));
  });

  client.on('messageReactionAdd', (_reaction, user) => {
    if (user.bot) return;
    const guildId = _reaction.message.guildId;
    if (!guildId) return;
    void recordReaction(guildId, user.id, todayKey()).catch((e) => console.error('[activity] react:', e));
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    const guildId = newState.guild.id;
    const userId = newState.id;
    if (newState.member?.user.bot) return;
    const key = `${guildId}:${userId}`;
    const wasIn = oldState.channelId;
    const isIn = newState.channelId;
    if (!wasIn && isIn) {
      voiceJoinTimes.set(key, now());
    } else if (wasIn && !isIn) {
      const start = voiceJoinTimes.get(key);
      voiceJoinTimes.delete(key);
      if (start !== undefined) void addVoiceSeconds(guildId, userId, todayKey(), elapsedSeconds(start, now())).catch(() => {});
    } else if (wasIn && isIn && wasIn !== isIn) {
      // channel move: bank the elapsed, restart the clock
      const start = voiceJoinTimes.get(key);
      if (start !== undefined) void addVoiceSeconds(guildId, userId, todayKey(), elapsedSeconds(start, now())).catch(() => {});
      voiceJoinTimes.set(key, now());
    }
  });
}
```

`apps/bot/src/index.ts`: after the client is created and before `login`, call `registerActivityTracking(client)`.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @gamebot/bot test && pnpm --filter @gamebot/bot build`.

```bash
git add -A
git commit -m "feat(bot): activity tracking events (messages, reactions, voice seconds)"
```

---

### Task 8: Voice admin kick command + personality toggle

**Files:**
- Create: `apps/bot/src/modules/voice-ai/kick.ts`, `apps/bot/src/modules/voice-ai/kick.test.ts`
- Modify: `apps/bot/src/modules/voice-ai/router.ts`, `apps/bot/src/modules/voice-ai/prompts.ts`
- Test: extend `apps/bot/src/modules/voice-ai/router.test.ts`

**Interfaces:**
- Consumes: `isGuildAdmin` (`apps/bot/src/lib/permissions.ts`), `getGuildConfig`, `buildSystemPrompt` (prompts.ts).
- Produces:
  - `resolveKickTarget(spokenName: string, members: { id: string; displayName: string }[]): string | null` — normalized best-match member id or null.
  - Router `اطرد`/`kick` branch: gated on speaker admin (Manage Guild or `config.admin_role_id`); disconnects matched member; returns spoken confirmation or clarification.
  - `buildSystemPrompt(dialect, guildName, opts?: { comedic?: boolean })` — when `comedic`, appends a "be very funny in the server dialect" instruction.

- [ ] **Step 1: Write failing tests**

`apps/bot/src/modules/voice-ai/kick.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveKickTarget } from './kick.js';

const members = [
  { id: '1', displayName: 'Ahmad' },
  { id: '2', displayName: 'سعود' },
  { id: '3', displayName: 'Khalid Pro' },
];

describe('resolveKickTarget', () => {
  it('matches by normalized contains, case-insensitive', () => {
    expect(resolveKickTarget('احمد', members)).toBe('1'); // normalization-insensitive
    expect(resolveKickTarget('khalid', members)).toBe('3');
    expect(resolveKickTarget('سعود', members)).toBe('2');
  });
  it('returns null when no confident match', () => {
    expect(resolveKickTarget('someone', members)).toBeNull();
  });
});
```

Add to `router.test.ts` a test that a non-admin speaker's kick attempt returns the permission-denied string (mock `getGuildConfig` + a `guild.members` fake + speaker without admin). Follow the existing router.test mock structure.

Add to `prompts.test.ts`:
```ts
it('comedic option changes the prompt', () => {
  const base = buildSystemPrompt('gulf', 'X');
  const funny = buildSystemPrompt('gulf', 'X', { comedic: true });
  expect(funny).not.toBe(base);
  expect(funny).toMatch(/كوميدي|مضحك|نكت/);
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/bot test`.

- [ ] **Step 3: Implement kick matcher**

`apps/bot/src/modules/voice-ai/kick.ts`:
```ts
import { normalizeText } from '@gamebot/shared';

/** Best-effort match of a spoken name to a member id; null if not confident. */
export function resolveKickTarget(spokenName: string, members: { id: string; displayName: string }[]): string | null {
  const q = normalizeText(spokenName);
  if (!q) return null;
  const exact = members.find((m) => normalizeText(m.displayName) === q);
  if (exact) return exact.id;
  const contains = members.filter((m) => {
    const n = normalizeText(m.displayName);
    return n.includes(q) || q.includes(n);
  });
  return contains.length === 1 ? contains[0].id : null;
}
```

- [ ] **Step 4: Personality prompt option**

In `apps/bot/src/modules/voice-ai/prompts.ts`, change the signature to `buildSystemPrompt(dialect: Dialect, guildName: string, opts: { comedic?: boolean } = {})` and, when `opts.comedic`, append a line such as: `كن كوميديًا جدًا ومرِحًا في ردك، بنكهة نكت خفيفة بلهجة السيرفر، مع بقاء الرد قصيرًا.`

- [ ] **Step 5: Router branches**

In `router.ts`:
- Add near the top of command handling a kick branch: if `q` matches `/^(اطرد|كك|kick)\b/i`, load `config = await getGuildConfig(guild.id)`, get the speaker member from `guild.members.cache.get(speakerId)`, and require `isGuildAdmin(member, config.admin_role_id)`. If not admin → return `S.onlyCreatorOrAdmin` (reuse existing key or add `S.kickNeedsAdmin`). Otherwise strip the command word to get the spoken name, build the member list from the bot's current voice channel members, call `resolveKickTarget`; on hit `await guild.members.cache.get(targetId)?.voice.disconnect()` and return a spoken confirmation; on miss return a clarification string.
- In the AI fallback branch, pass `{ comedic: config.voice.personality_enabled }` to `buildSystemPrompt`.

(The router already receives `speakerId` and `guild`; `getGuildConfig` is already imported. Add `isGuildAdmin` import and the `resolveKickTarget` import.)

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @gamebot/bot test && pnpm --filter @gamebot/bot build`.

```bash
git add -A
git commit -m "feat(voice-ai): admin voice-kick command and comedic personality toggle"
```

---

### Task 9: Voice profanity moderation

**Files:**
- Create: `apps/bot/src/modules/protection/voice-mod.ts`, `apps/bot/src/modules/protection/voice-mod.test.ts`
- Modify: `apps/bot/src/modules/voice-ai/listen.ts`

**Interfaces:**
- Consumes: `matchesProfanity` (`@gamebot/shared`), `getGuildConfig`, `playSpeech`/session (voice-ai).
- Produces:
  - Pure `class ProfanityTracker { register(guildId, userId, now): 'warn' | 'kick' }` — first offense within 1h window → `'warn'`, second → `'kick'`; window is 1h sliding; `now` injected.
  - `handleTranscriptModeration(guild, session, userId, text): Promise<boolean>` — when `protection.enabled && protection.voice_moderation` and `matchesProfanity`, runs the tracker: warn (TTS by display name) or disconnect; returns `true` if it acted (so the listen pipeline skips wake-word routing for that utterance).

- [ ] **Step 1: Write failing test (pure tracker)**

`apps/bot/src/modules/protection/voice-mod.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ProfanityTracker } from './voice-mod.js';

describe('ProfanityTracker', () => {
  it('warns first, kicks second within the hour, warns again after the window', () => {
    const t = new ProfanityTracker();
    const base = 1_000_000_000;
    expect(t.register('g', 'u', base)).toBe('warn');
    expect(t.register('g', 'u', base + 5 * 60_000)).toBe('kick'); // 5 min later
    // > 1h after the FIRST → window reset → warn again
    expect(t.register('g', 'u', base + 61 * 60_000)).toBe('warn');
  });
  it('tracks users independently', () => {
    const t = new ProfanityTracker();
    expect(t.register('g', 'a', 0)).toBe('warn');
    expect(t.register('g', 'b', 0)).toBe('warn');
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/bot test`.

- [ ] **Step 3: Implement tracker + handler**

`apps/bot/src/modules/protection/voice-mod.ts`:
```ts
import type { Guild } from 'discord.js';
import { matchesProfanity } from '@gamebot/shared';
import { getGuildConfig } from '@gamebot/db';
import { playSpeech, type VoiceSession } from '../voice-ai/sessions.js';

const WINDOW_MS = 60 * 60 * 1000;

export class ProfanityTracker {
  private first = new Map<string, number>(); // key → first-offense ms within the current window

  register(guildId: string, userId: string, now: number): 'warn' | 'kick' {
    const key = `${guildId}:${userId}`;
    const firstAt = this.first.get(key);
    if (firstAt === undefined || now - firstAt > WINDOW_MS) {
      this.first.set(key, now);
      return 'warn';
    }
    this.first.delete(key); // reset after a kick
    return 'kick';
  }
}

const tracker = new ProfanityTracker();

export async function handleTranscriptModeration(
  guild: Guild,
  _session: VoiceSession,
  userId: string,
  text: string,
  now: () => number = Date.now,
): Promise<boolean> {
  const config = await getGuildConfig(guild.id);
  if (!config.protection.enabled || !config.protection.voice_moderation) return false;
  if (!matchesProfanity(text, config.protection.custom_words)) return false;

  const member = guild.members.cache.get(userId);
  const name = member?.displayName ?? 'عضو';
  const action = tracker.register(guild.id, userId, now());
  if (action === 'warn') {
    await playSpeech(guild.id, `يا ${name}، انتبه لألفاظك من فضلك.`).catch(() => {});
  } else {
    await playSpeech(guild.id, `يا ${name}، تم إخراجك بسبب تكرار الألفاظ.`).catch(() => {});
    await member?.voice.disconnect().catch(() => {});
  }
  return true;
}
```

- [ ] **Step 4: Wire into the listen pipeline**

In `apps/bot/src/modules/voice-ai/listen.ts`, inside `onUtteranceEnd` after obtaining `text` from `transcribe(...)` and BEFORE the wake-word `parseWakeWord` routing: call
```ts
const { handleTranscriptModeration } = await import('../protection/voice-mod.js');
if (await handleTranscriptModeration(guild, session, userId, text)) return; // moderated → skip wake-word handling
```
(Keep it lazy-imported like the existing router import to avoid cycles.)

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @gamebot/bot test && pnpm --filter @gamebot/bot build`.

```bash
git add -A
git commit -m "feat(protection): voice profanity moderation — warn then disconnect"
```

---

### Task 10: Text protection (messageCreate)

**Files:**
- Create: `apps/bot/src/modules/protection/text-mod.ts`, `apps/bot/src/modules/protection/text-mod.test.ts`
- Modify: `apps/bot/src/index.ts`

**Interfaces:**
- Consumes: `scanMessage` (`@gamebot/shared`), `getGuildConfig`, `isGuildAdmin`.
- Produces: `registerTextProtection(client: Client): void` — on `messageCreate`, when the author is a non-admin guild member and `protection.enabled && protection.text_protection`, run `scanMessage(content, {customWords, allowedDomains})`; if blocked, delete the message, send an ephemeral-style warning (a normal channel reply that auto-deletes after ~5s), and post to `log_channel_id` if set. Pure decision extracted as `shouldModerate(config, isAdmin)`.

- [ ] **Step 1: Write failing test**

`apps/bot/src/modules/protection/text-mod.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { shouldModerate } from './text-mod.js';

const cfg = (over: Partial<{ enabled: boolean; text: boolean }>) => ({
  protection: {
    enabled: over.enabled ?? true,
    text_protection: over.text ?? true,
    voice_moderation: true,
    custom_words: [],
    allowed_domains: [],
    log_channel_id: null,
  },
}) as never;

describe('shouldModerate', () => {
  it('only moderates non-admins when both toggles on', () => {
    expect(shouldModerate(cfg({}), false)).toBe(true);
    expect(shouldModerate(cfg({}), true)).toBe(false); // admins exempt
    expect(shouldModerate(cfg({ enabled: false }), false)).toBe(false);
    expect(shouldModerate(cfg({ text: false }), false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/bot test`.

- [ ] **Step 3: Implement**

`apps/bot/src/modules/protection/text-mod.ts`:
```ts
import { type Client, type GuildMember, type TextChannel } from 'discord.js';
import { scanMessage } from '@gamebot/shared';
import { getGuildConfig } from '@gamebot/db';
import { isGuildAdmin } from '../../lib/permissions.js';
import type { GuildConfig } from '@gamebot/shared';

export function shouldModerate(config: GuildConfig, isAdmin: boolean): boolean {
  return config.protection.enabled && config.protection.text_protection && !isAdmin;
}

export function registerTextProtection(client: Client): void {
  client.on('messageCreate', async (msg) => {
    try {
      if (!msg.guild || msg.author.bot || !msg.member) return;
      const config = await getGuildConfig(msg.guild.id);
      const admin = isGuildAdmin(msg.member as GuildMember, config.admin_role_id);
      if (!shouldModerate(config, admin)) return;

      const verdict = scanMessage(msg.content, {
        customWords: config.protection.custom_words,
        allowedDomains: config.protection.allowed_domains,
      });
      if (!verdict.blocked) return;

      await msg.delete().catch(() => {});
      const warn = await (msg.channel as TextChannel)
        .send(`<@${msg.author.id}> رسالتك حُذفت (${verdict.reason}). ممنوع الروابط المشبوهة/السكام.`)
        .catch(() => null);
      if (warn) setTimeout(() => void warn.delete().catch(() => {}), 5000);

      if (config.protection.log_channel_id) {
        const log = msg.guild.channels.cache.get(config.protection.log_channel_id);
        if (log?.isTextBased()) {
          await (log as TextChannel)
            .send(`🛡️ حذف رسالة من <@${msg.author.id}> — السبب: ${verdict.reason}`)
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error('[text-protection]', err);
    }
  });
}
```

`apps/bot/src/index.ts`: call `registerTextProtection(client)` alongside `registerActivityTracking(client)`.

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @gamebot/bot test && pnpm --filter @gamebot/bot build`.

```bash
git add -A
git commit -m "feat(protection): text scam/link protection on messageCreate"
```

---

### Task 11: Welcome — canvas image + guildMemberAdd

**Files:**
- Create: `apps/bot/src/lib/welcome-image.ts`, `apps/bot/src/lib/welcome-image.test.ts`, `apps/bot/src/events/guildMemberAdd.ts`
- Modify: `apps/bot/package.json` (add `@napi-rs/canvas`), `apps/bot/src/index.ts`

**Interfaces:**
- Consumes: `getGuildConfig`.
- Produces:
  - `renderWelcomeImage(opts: { bannerUrl: string; avatarUrl: string; name: string | null; x: number; y: number; size: number }): Promise<Buffer>` — loads banner + avatar via `@napi-rs/canvas` `loadImage`, draws a circular avatar at relative `(x,y)` with relative diameter `size` of the banner width, optional name text below; returns PNG buffer.
  - `formatWelcome(template, { user, server, count }): string` — replaces `{user}`/`{server}`/`{count}`.
  - `registerWelcome(client)` — on `guildMemberAdd`, when enabled + channel set, sends the formatted message; if `banner_url` set, attaches the rendered image, else plain text.

- [ ] **Step 1: Add dependency**

Run: `pnpm --filter @gamebot/bot add @napi-rs/canvas@^0.1`

- [ ] **Step 2: Write failing tests (pure formatter + image smoke)**

`apps/bot/src/lib/welcome-image.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatWelcome } from './welcome-image.js';

describe('formatWelcome', () => {
  it('substitutes user mention, server and count', () => {
    expect(formatWelcome('أهلاً {user} في {server}! ({count})', { user: '<@1>', server: 'ARAB', count: 42 }))
      .toBe('أهلاً <@1> في ARAB! (42)');
  });
});
```
(The `renderWelcomeImage` canvas path needs network image loads; do NOT unit-test the pixel output — it's covered by the operator smoke test. Keep the test on the pure formatter.)

- [ ] **Step 3: Run to verify FAIL** — `pnpm --filter @gamebot/bot test`.

- [ ] **Step 4: Implement**

`apps/bot/src/lib/welcome-image.ts`:
```ts
import { createCanvas, loadImage } from '@napi-rs/canvas';

export function formatWelcome(template: string, vars: { user: string; server: string; count: number }): string {
  return template
    .replaceAll('{user}', vars.user)
    .replaceAll('{server}', vars.server)
    .replaceAll('{count}', String(vars.count));
}

export async function renderWelcomeImage(opts: {
  bannerUrl: string;
  avatarUrl: string;
  name: string | null;
  x: number;
  y: number;
  size: number;
}): Promise<Buffer> {
  const banner = await loadImage(opts.bannerUrl);
  const W = banner.width;
  const H = banner.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(banner, 0, 0, W, H);

  const d = Math.round(opts.size * W); // diameter relative to width
  const cx = Math.round(opts.x * W);
  const cy = Math.round(opts.y * H);
  const r = d / 2;

  const avatar = await loadImage(opts.avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, cx - r, cy - r, d, d);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, Math.round(d * 0.04));
  ctx.strokeStyle = '#22d3ee';
  ctx.stroke();

  if (opts.name) {
    ctx.font = `bold ${Math.round(d * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(opts.name, cx, cy + r + Math.round(d * 0.28));
  }

  return canvas.toBuffer('image/png');
}
```

`apps/bot/src/events/guildMemberAdd.ts`:
```ts
import { AttachmentBuilder, type Client, type TextChannel } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import { formatWelcome, renderWelcomeImage } from '../lib/welcome-image.js';

export function registerWelcome(client: Client): void {
  client.on('guildMemberAdd', async (member) => {
    try {
      const config = await getGuildConfig(member.guild.id);
      if (!config.welcome.enabled || !config.welcome.channel_id) return;
      const channel = member.guild.channels.cache.get(config.welcome.channel_id);
      if (!channel?.isTextBased()) return;

      const content = formatWelcome(config.welcome.message, {
        user: `<@${member.id}>`,
        server: member.guild.name,
        count: member.guild.memberCount,
      });

      const files: AttachmentBuilder[] = [];
      if (config.welcome.banner_url) {
        const buf = await renderWelcomeImage({
          bannerUrl: config.welcome.banner_url,
          avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }),
          name: config.welcome.show_name ? member.displayName : null,
          x: config.welcome.avatar_x,
          y: config.welcome.avatar_y,
          size: config.welcome.avatar_size,
        }).catch(() => null);
        if (buf) files.push(new AttachmentBuilder(buf, { name: 'welcome.png' }));
      }
      await (channel as TextChannel).send({ content, files }).catch(() => {});
    } catch (err) {
      console.error('[welcome]', err);
    }
  });
}
```

`apps/bot/src/index.ts`: call `registerWelcome(client)`.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @gamebot/bot test && pnpm --filter @gamebot/bot build`.

```bash
git add -A
git commit -m "feat(welcome): guildMemberAdd canvas banner with positioned avatar"
```

---

### Task 12: Web — reshape `/stats`, drop match routes, extend DiscordRest

**Files:**
- Modify: `apps/web/src/server/routes/api.ts`, `apps/web/src/server/discord-rest.ts`, `apps/web/src/server/testing/fake-rest.ts`
- Delete: `apps/web/src/server/routes/manage.test.ts` (match cancel/adjust/leaderboard tests)
- Test: `apps/web/src/server/routes/stats.test.ts` (reshape)

**Interfaces:**
- Consumes: `topActive`, `activityDaily` (Task 6), existing `memberSnapshots`/`matchesPerDay`→removed, `getGuildCounts`/`listMembers`.
- Produces: `GET /api/guilds/:id/stats?days=` returns `{ memberCount, joinedRecent, memberSeries, memberSeriesSource, messagesDaily, voiceMinutesDaily, topActive, totals: { newMembers, messages, voiceMinutes } }` — no match fields. Match routes (`leaderboard`, `matches`, `matches/:id/cancel`, `players/:id/adjust`) removed.

- [ ] **Step 1: Remove match API routes**

In `apps/web/src/server/routes/api.ts`, delete the `leaderboard`, `matches`, `matches/:matchId/cancel`, and `players/:userId/adjust` route registrations and any now-unused imports (`topPlayers`, `getActiveMatch`, `recentMatches`, `cancelMatch`, `adjustPlayerPoints`, `mostActivePlayers`). `git rm apps/web/src/server/routes/manage.test.ts`.

- [ ] **Step 2: Reshape the stats handler + test**

Rewrite the `/stats` handler to drop `matchesPerDay`/`newPlayersPerDay`/`topPlayers`/`mostActive` and use activity instead. Response builder:
```ts
const [counts, members, snaps, activeRows, dailyRows] = await Promise.all([
  rest.getGuildCounts(guildId),
  membersCached(guildId, rest),
  memberSnapshots(guildId, days),
  topActive(guildId, days, 10),
  activityDaily(guildId, days),
]);
const nameById = new Map(members.map((m) => [m.id, m.username]));
// fillDays(days) as before; zero-fill messagesDaily & voiceMinutesDaily from dailyRows:
const messagesDaily = fillSeries(dailyRows.map((r) => ({ date: r.date, count: r.messages })), days);
const voiceMinutesDaily = fillSeries(dailyRows.map((r) => ({ date: r.date, count: Math.round(r.voice_seconds / 60) })), days);
res.json({
  memberCount: counts?.approximate_member_count ?? members.length ?? null,
  joinedRecent, memberSeries, memberSeriesSource,
  messagesDaily, voiceMinutesDaily,
  topActive: activeRows.map((r) => ({ ...r, name: nameById.get(r.user_id) ?? `#${r.user_id.slice(-4)}` })),
  totals: {
    newMembers,
    messages: dailyRows.reduce((s, r) => s + r.messages, 0),
    voiceMinutes: Math.round(dailyRows.reduce((s, r) => s + r.voice_seconds, 0) / 60),
  },
});
```
Keep the existing `fillDays`/`fillSeries`/`fillSnapshotSeries`/`joinedFallbackSeries` helpers and the cutoff-alignment (they already floor correctly). Update `stats.test.ts`: replace match assertions with `topActive` names + `messagesDaily` window span + `totals.messages`. Seed activity via the db repos.

- [ ] **Step 3: DiscordRest unchanged** — `listMembers`/`getGuildCounts` already exist from the prior stats work; no change needed. (If a match-only method exists, leave it; nothing references it after this task.)

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @gamebot/db build && pnpm --filter @gamebot/web test && pnpm --filter @gamebot/web build`.

```bash
git add -A
git commit -m "feat(web): reshape stats around activity, remove match API routes"
```

---

### Task 13: Web — config PATCH schema (protection/welcome), drop customs

**Files:**
- Modify: `apps/web/src/server/routes/api.ts` (the `ConfigPatch` zod schema + PATCH handler)
- Test: extend `apps/web/src/server/routes/api.test.ts`

**Interfaces:**
- Produces: PATCH `/api/guilds/:id/config` accepts a strict patch over `admin_role_id`, `voice.{enabled,wake_word,dialect,allowed_channel_ids,personality_enabled}`, `protection.{enabled,voice_moderation,text_protection,custom_words,allowed_domains,log_channel_id}`, `welcome.{enabled,channel_id,message,banner_url,avatar_x,avatar_y,avatar_size,show_name}`. `premium` still NOT patchable. Unknown keys → 400.

- [ ] **Step 1: Write failing tests** — in `api.test.ts` add: patch `protection.enabled=true` persists; patch `welcome.avatar_x=1.5` → 400 (out of range); patch `customs` → 400 (unknown); patch `voice.personality_enabled=true` persists.

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/web test`.

- [ ] **Step 3: Replace `ConfigPatch`**

```ts
const ConfigPatch = z
  .object({
    admin_role_id: z.string().nullable().optional(),
    voice: z
      .object({
        enabled: z.boolean().optional(),
        wake_word: z.string().min(2).max(30).optional(),
        dialect: z.enum(DIALECTS).optional(),
        allowed_channel_ids: z.array(z.string()).max(50).optional(),
        personality_enabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
    protection: z
      .object({
        enabled: z.boolean().optional(),
        voice_moderation: z.boolean().optional(),
        text_protection: z.boolean().optional(),
        custom_words: z.array(z.string().min(1).max(60)).max(200).optional(),
        allowed_domains: z.array(z.string().min(3).max(120)).max(200).optional(),
        log_channel_id: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
    welcome: z
      .object({
        enabled: z.boolean().optional(),
        channel_id: z.string().nullable().optional(),
        message: z.string().max(500).optional(),
        banner_url: z.string().url().nullable().optional(),
        avatar_x: z.number().min(0).max(1).optional(),
        avatar_y: z.number().min(0).max(1).optional(),
        avatar_size: z.number().min(0.05).max(0.6).optional(),
        show_name: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
```
(Remove the old `customs` block from the patch schema. `DIALECTS` is already imported.)

- [ ] **Step 4: Run to verify PASS** — `pnpm --filter @gamebot/web test && pnpm --filter @gamebot/web build`.

- [ ] **Step 5: Commit** — `git commit -am "feat(web): config patch for protection/welcome, drop customs"`

---

### Task 14: Web client — remove match tabs, reshape Stats

**Files:**
- Delete: `apps/web/src/client/components/MatchesTab.tsx`, `apps/web/src/client/components/LeaderboardTab.tsx`
- Modify: `apps/web/src/client/pages/GuildView.tsx`, `apps/web/src/client/components/StatsTab.tsx`, `apps/web/src/client/components/SettingsTab.tsx`, `apps/web/src/client/components/Overview.tsx`, locales `ar.json`/`en.json`
- Test: `apps/web/src/client/components/StatsTab.test.tsx`, `apps/web/src/client/components/SettingsTab.test.tsx`

**Interfaces:**
- Produces: GuildView tabs = `overview`, `settings`, `protection`, `welcome`, `stats` (protection/welcome added in Tasks 15-16; add their routes now pointing at placeholders, or add in those tasks — here just remove matches/leaderboard). StatsTab renders activity: tiles (members, new members, messages, voice minutes), most-active horizontal chart (by score, name-labeled), member growth line, messages/day + voice-minutes/day bar charts. SettingsTab drops the customs form and instead edits `admin_role_id` + `voice.personality_enabled`.

- [ ] **Step 1: Delete + de-route match tabs**

```bash
git rm apps/web/src/client/components/MatchesTab.tsx apps/web/src/client/components/LeaderboardTab.tsx
```
In `GuildView.tsx` remove the `matches` and `leaderboard` tab entries, imports, and `<Route>`s. In `Overview.tsx` remove the active-match card, the `useQuery(['matches',...])`, and the cancel `useMutation` (they hit the now-deleted `/matches` + cancel routes); keep the usage progress bars. Remove now-unused `overview.activeMatch`/`overview.noActiveMatch`/`overview.cancelMatch` i18n keys.

- [ ] **Step 2: Reshape StatsTab**

Rewrite `StatsTab.tsx` data types + charts to the new `/stats` shape. Tiles: `memberCount`, `totals.newMembers`, `totals.messages`, `totals.voiceMinutes`. Charts (reuse existing `ChartCard`/`AXIS_TICK`/`TOOLTIP_PROPS`/`isAllZero` constants and validated palette):
- Most active: horizontal `BarChart`, category `name`, value `score`, fill `#6366f1`, radius `[0,4,4,0]`, title `t('stats.mostActive')`.
- Member growth: line `#0891b2` (unchanged) with fallback hint.
- Messages/day: `BarChart` `#059669`, radius `[4,4,0,0]`, `t('stats.messagesPerDay')`.
- Voice minutes/day: `BarChart` `#d97706`, radius `[4,4,0,0]`, `t('stats.voicePerDay')`.
Keep the recently-joined list. Remove all match charts. Update `StatsTab.test.tsx` stub fixture to the new shape (tiles render, days pill refetch).

- [ ] **Step 3: Update SettingsTab (drop customs, add personality + admin role)**

In `SettingsTab.tsx`: delete the entire customs form (`CustomsForm` schema, its `useForm`, and its JSX card — win_points/loss_points/admin_role_id). Keep the voice form and ADD to it: a `personality_enabled` checkbox (bound like `enabled`) and, as a separate small field, an `admin_role_id` text input that PATCHes the top-level `{ admin_role_id }` (not nested). So the voice submit sends `{ voice: {...incl personality_enabled} }` and a second tiny form/field sends `{ admin_role_id }`. The `GuildConfigResp` interface drops `customs` and gains `admin_role_id: string | null` and `voice.personality_enabled: boolean`. Update `SettingsTab.test.tsx`: replace any customs assertions; assert toggling personality_enabled PATCHes `voice.personality_enabled`, and the wake-word validation test still passes.

- [ ] **Step 4: i18n**

In both locales replace `stats.matches`/`stats.aiQuestions`/`stats.matchesPerDay`/`stats.aiPerDay`/`stats.listenPerDay`/`stats.newPlayersPerDay`/`stats.topPlayers` with: `stats.messages`, `stats.voiceMinutes`, `stats.messagesPerDay`, `stats.voicePerDay`, `stats.mostActive` ("الأكثر نشاطًا" / "Most active"). Remove `tabs.matches`/`tabs.leaderboard` and the customs settings keys (`settings.customs*`); add `settings.personality` ("الشخصية الكوميدية" / "Comedic personality") and `settings.adminRole` (keep if it already exists). Keep identical key sets across ar/en.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @gamebot/web test && pnpm --filter @gamebot/web build`.

```bash
git add -A
git commit -m "feat(web): drop match tabs, reshape Stats, pivot Settings to personality/admin-role"
```

---

### Task 15: Web — Protection tab

**Files:**
- Create: `apps/web/src/client/components/ProtectionTab.tsx`, `apps/web/src/client/components/ProtectionTab.test.tsx`
- Modify: `apps/web/src/client/pages/GuildView.tsx`, locales

**Interfaces:**
- Consumes: `api`, `useI18n`, react-hook-form + zod (mirror `SettingsTab`).
- Produces: form for `protection.{enabled,voice_moderation,text_protection}` toggles + `custom_words` (comma/newline textarea → string[]) + `allowed_domains` (textarea → string[]) + `log_channel_id` (text). PATCH `{ protection: {...} }`. `ProtectionTab({ guildId })` wired as the `protection` route/tab.

- [ ] **Step 1: Write failing test** — load config stub, toggle `enabled`, save → assert a PATCH with `protection.enabled` in the body (mirror `SettingsTab.test.tsx` fetch-stub pattern).

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/web test`.

- [ ] **Step 3: Implement** — model the component on `SettingsTab.tsx` (same glass card, `useForm` + `zodResolver`, `useQuery(['config',guildId])`, `patch` mutation invalidating `['config',guildId]`, saved banner). Textareas split on `/[\n,]/`, trim, drop empties before PATCH. All labels via `t('protection.*')` keys (add to both locales, identical sets). Add the tab entry + `<Route path="protection">` in `GuildView.tsx`.

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @gamebot/web test && pnpm --filter @gamebot/web build`.

```bash
git add -A
git commit -m "feat(web): protection settings tab"
```

---

### Task 16: Web — Welcome tab with draggable avatar preview

**Files:**
- Create: `apps/web/src/client/components/WelcomeTab.tsx`, `apps/web/src/client/components/WelcomeTab.test.tsx`
- Modify: `apps/web/src/client/pages/GuildView.tsx`, locales

**Interfaces:**
- Produces: form for `welcome.{enabled,channel_id,message,banner_url,show_name}` + an interactive preview: when `banner_url` is set, render an `<img>` inside a relatively-positioned box; a draggable circular handle sets `avatar_x`/`avatar_y` (0–1 of the box) and a size slider sets `avatar_size`. PATCH `{ welcome: {...} }` including the three numeric coords. `WelcomeTab({ guildId })` wired as `welcome` route/tab.

- [ ] **Step 1: Write failing test** — stub config with a banner_url; assert the preview handle renders and that saving PATCHes `welcome.avatar_x`/`avatar_y`/`avatar_size` as numbers in 0–1 (you can set values via the number inputs rather than simulating a drag — expose numeric inputs bound to the same state as the drag handle so the test is deterministic).

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter @gamebot/web test`.

- [ ] **Step 3: Implement**

Component notes:
- State `pos = { x, y, size }` seeded from config. The preview box uses `onPointerDown`/`onPointerMove` on the handle computing `x = (e.clientX - rect.left) / rect.width` clamped 0–1 (same for y); update state imperatively-then-commit to react state on pointer up. ALSO render three number inputs (`avatar_x`, `avatar_y`, `avatar_size`, step 0.01) bound to the same state — these make the test deterministic and give keyboard users an accessible path.
- Circular handle absolutely positioned at `left: x*100% top: y*100%`, translated -50%,-50%, diameter `size*boxWidth`.
- Message textarea supports `{user}`/`{server}`/`{count}` (hint text). Save PATCHes the full `welcome` object. All labels via `t('welcome.*')` (both locales). Add the tab + route in `GuildView.tsx`.

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @gamebot/web test && pnpm --filter @gamebot/web build`.

```bash
git add -A
git commit -m "feat(web): welcome settings tab with draggable avatar preview"
```

---

### Task 17: Landing cards, README, full verification

**Files:**
- Modify: `apps/web/src/client/pages/Landing.tsx`, locales, `README.md`

**Interfaces:**
- Produces: Landing feature cards reflect the four features; README documents the pivot (removed customs; new features; MessageContent intent requirement for text protection; `@napi-rs/canvas` for welcome).

- [ ] **Step 1: Landing feature cards**

In `Landing.tsx`, replace the three feature cards' i18n keys/content to: **مساعد صوتي ذكي** (voice assistant + admin commands + personality), **الحماية** (voice+text moderation, anti-scam), **الإحصائيات والترحيب** (activity insights + auto welcome). Update `landing.feature.*` values in both locales (identical key sets). Keep the Discord login button and invite CTA.

- [ ] **Step 2: README**

Update `README.md`: remove customs/leaderboard/profile from the command list and feature descriptions; add the four features; document that **text protection requires enabling the privileged MessageContent intent** in the Developer Portal (and that activity message-counting does not); note `@napi-rs/canvas` is bundled (prebuilt, no native build). Update the operator smoke checklist: enable protection and post a `discord.gg/...` link as a non-admin → it's deleted; set a welcome channel + banner → a join renders the image; speak a bad word in voice with moderation on → warning then disconnect on repeat.

- [ ] **Step 3: Full sweep**

Run: `pnpm -r test` then `pnpm build`.
Expected: all packages green (shared/db/bot/web), clean builds. Report real counts.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs+web: landing cards and README for the Kabtn pivot"
```

---

## Post-plan notes

- Wake word default changed to `يا كابتن`; existing guilds with a stored config keep their saved value (only new configs get the new default) — acceptable.
- In-memory state (profanity window, voice join times) resets on bot restart — acceptable per spec.
- Text protection and MessageContent intent are OFF by default; the bot runs fully without the privileged intent until an admin enables text protection.
- Deferred/out-of-scope (per spec §8): standalone defamation detector, message-content storage, periodic comedic interjections, escalating text penalties, Stripe/premium.
