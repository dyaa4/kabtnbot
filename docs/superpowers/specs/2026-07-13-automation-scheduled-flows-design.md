# Automation rename + scheduled flows — design

Date: 2026-07-13. Approved by owner.

## Goal

1. Rename the "Commands" feature to **Automation** (tab, titles, texts) in all six locales.
2. Add a **schedule trigger**: an automation can run every X minutes/hours/days
   (5 min – 7 days) in addition to — or instead of — phrase triggers. Scheduled
   output goes to a configured text channel; if the bot is in a voice session
   the reply is also spoken.
3. Make the editor UI easier: clear phrase/schedule trigger sections, a fourth
   starter template ("⏰ scheduled message"), ⏰ marker in the sidebar.

## Schema (packages/shared/command-flows.ts)

```ts
schedule: z.object({
  enabled: z.boolean().default(false),
  every_minutes: z.number().int().min(5).max(10080).default(60),
  channel_id: z.string().default(''),   // output channel, required when enabled
}).default({})
```

- `triggers` relaxes from `min(1)` to `min(0)`; a `superRefine` requires
  `triggers.length > 0 || schedule.enabled` and `channel_id !== ''` when
  `schedule.enabled`. Existing flows parse unchanged (schedule defaults off).

## Bot scheduler (apps/bot/src/modules/custom-commands/scheduler.ts)

- One `setInterval` tick per minute over `client.guilds.cache`.
- Per guild: `getCachedCommandFlows` → flows with `enabled && schedule.enabled`.
- Last-run times persist in Mongo (`schedule_runs`: guildId+flowId unique,
  lastRunAt) so Railway redeploys don't reset long intervals.
- First activation initializes lastRunAt=now WITHOUT executing (no save-spam);
  a flow is due when `now - lastRunAt >= every_minutes`.
- Execution: `executeActions` with `source: 'schedule'`, invoker = bot user,
  `utterance` = fixed instruction for ai_reply ("produce the scheduled content").
  Accumulated reply → schedule channel (2000-char cap, mentions off); also
  spoken via playSpeech when a voice session exists. ai_reply still consumes
  the guild AI quota. Member-targeted actions (dm_user, roles, timeout…)
  resolve against the bot member and no-op/fail silently — the UI steers
  scheduled automations toward say/AI/channel-message actions.

## Web UI

- Trigger node: two labeled sections — "عند عبارة" (existing phrase UI) and
  "مجدول" (toggle + number input + unit select minutes/hours/days + output
  ChannelSelect). Phrase-specific fields (match mode, sources, LLM fallback)
  hide when there are no phrases.
- Empty state gets a fourth template card: ⏰ scheduled message (schedule on,
  60 min, send_message action).
- FolderSidebar shows ⏰ next to scheduled flows.
- All six locale files: `tabs.commands` → Automation etc., new keys for the
  schedule section.

## Per-step intervals (follow-up, same day)

Owner: a step should be able to run on its own cadence ("this message every
5 minutes") instead of only the flow-wide interval.

- Schema: every action gets `repeat_minutes` (0 = default, run with the flow's
  schedule interval; 5–10080 = own cadence). Old flows parse unchanged.
- Scheduler: flows expand into **units** — one base batch (all actions with
  `repeat_minutes: 0`, keyed `flowId`, on `schedule.every_minutes`) plus one
  unit per self-timed action (keyed `flowId:actionId`, on its own interval).
  Same init-without-firing + stamp-before-execute rules per unit; the
  `schedule_runs` collection stores composite keys in `flow_id` unchanged.
- Per-step intervals are only active while the flow schedule is enabled — that
  keeps the "schedule ⇒ output channel" validation the single source of truth.
- UI: action nodes on scheduled flows get a "⏱ own interval" toggle +
  IntervalPicker (extracted from the trigger's schedule section, shared).

## Testing

- shared: schedule-only flow valid; no-trigger + no-schedule invalid; schedule
  without channel invalid.
- bot: due-logic pure function tests; scheduler executes due flow into the
  channel (mocked).
- web: template card renders; schedule section toggles; locale key parity
  (existing i18n-keys test covers new keys automatically).
