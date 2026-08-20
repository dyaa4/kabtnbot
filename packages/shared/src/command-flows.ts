import { z } from 'zod';
import { normalizeText } from './moderation.js';

// User-defined command flows (dashboard flow editor) + per-guild overrides for
// the built-in voice commands. Matching is language-agnostic: triggers are
// folded with the SAME normalizeText the wake word and profanity filter use,
// so STT spelling variance (diacritics, alef forms, elongation) doesn't break
// phrase matching.

export const BUILTIN_COMMAND_KEYS = ['leave', 'stop', 'say', 'kick', 'help', 'ping'] as const;
export type BuiltinCommandKey = (typeof BUILTIN_COMMAND_KEYS)[number];

// Discord SLASH commands the bot registers. Admins can disable each per guild
// and restrict it to roles/users from the dashboard; the bot enforces this in
// its interaction handler (guild admins always bypass, so /settings can't
// lock the admins out of their own server).
export const SLASH_COMMAND_KEYS = [
  'join', 'leave', 'listen', 'speak', 'ask', 'chat', 'summarize', 'welcome-test', 'settings', 'ping',
] as const;
export type SlashCommandKey = (typeof SLASH_COMMAND_KEYS)[number];

const NodePos = z.object({ x: z.number(), y: z.number() });
const idStr = z.string().min(1).max(40);

// Who an action operates on: the speaker/author of the trigger, a name
// captured after a 'prefix' trigger (resolved against voice-channel members
// like the built-in kick), or a specific member picked in the editor
// (target_user_id) — the only target that also works on scheduled runs.
const Target = z.enum(['speaker', 'spoken_name', 'member']).default('speaker');
const targetedBase = { target: Target, target_user_id: z.string().default('') };

const actionBase = {
  id: idStr,
  pos: NodePos.default({ x: 0, y: 0 }),
  // Own cadence for this step within a scheduled flow: 0 = run together with
  // the flow's schedule interval; >0 = run independently every N minutes
  // (same 1 min – 7 days window as the flow schedule). Ignored while the
  // flow's schedule is disabled.
  repeat_minutes: z.union([z.literal(0), z.number().int().min(1).max(10080)]).default(0),
};

/** Sentinel channel_id for voice_join: join the busiest voice channel.
 * Starts with '@' so it can never collide with a numeric Discord id. */
export const JOIN_BUSIEST_CHANNEL = '@busiest';

export const FlowActionSchema = z.discriminatedUnion('type', [
  // channel_id '' = the invoker's current voice channel ("join me");
  // JOIN_BUSIEST_CHANNEL = the voice channel with the most human members;
  // anything else = that picked channel. Scheduled runs need picked/busiest.
  z.object({ ...actionBase, type: z.literal('voice_join'), channel_id: z.string().default('') }),
  z.object({ ...actionBase, type: z.literal('voice_leave') }),
  z.object({ ...actionBase, type: z.literal('voice_stop_listening') }),
  z.object({ ...actionBase, type: z.literal('voice_disconnect_user'), ...targetedBase }),
  z.object({ ...actionBase, type: z.literal('voice_move_user'), ...targetedBase, channel_id: z.string().min(1) }),
  // {user} = invoker display name, {args} = captured remainder of a prefix trigger
  z.object({ ...actionBase, type: z.literal('speak_tts'), text: z.string().min(1).max(500) }),
  z.object({ ...actionBase, type: z.literal('send_message'), channel_id: z.string().min(1), text: z.string().min(1).max(2000) }),
  // Posts into the text chat of the voice channel the bot/invoker is in —
  // no channel pick needed, resolved at execution time.
  z.object({ ...actionBase, type: z.literal('send_voice_chat'), text: z.string().min(1).max(2000) }),
  z.object({ ...actionBase, type: z.literal('timeout_user'), ...targetedBase, duration_minutes: z.number().int().min(1).max(10080) }),
  z.object({ ...actionBase, type: z.literal('role_add'), ...targetedBase, role_id: z.string().min(1) }),
  z.object({ ...actionBase, type: z.literal('role_remove'), ...targetedBase, role_id: z.string().min(1) }),
  z.object({ ...actionBase, type: z.literal('ai_reply'), system_prompt: z.string().min(1).max(2000) }),
  // {user}/{args} like other texts; DMs additionally support {member} = recipient name.
  // With target 'member' the DM can go to several picked members AND/OR every
  // member holding one of the picked roles (capped + throttled bot-side).
  z.object({
    ...actionBase,
    type: z.literal('dm_user'),
    ...targetedBase,
    target_user_ids: z.array(z.string()).max(50).default([]),
    target_role_ids: z.array(z.string()).max(10).default([]),
    text: z.string().min(1).max(1000),
  }),
  // DMs every member with no message/voice activity in the last `days` days
  // (capped and throttled bot-side so one command can't mass-spam).
  z.object({ ...actionBase, type: z.literal('dm_inactive_members'), days: z.number().int().min(1).max(90).default(14), text: z.string().min(1).max(1000) }),
  // Find existing voice channels whose name includes `base_name`, then
  // distribute all human members from the bot's channel into those channels
  // in groups of `group_size` (shuffled randomly). The bot stays in the
  // original channel.
  z.object({
    ...actionBase,
    type: z.literal('voice_distribute'),
    group_size: z.number().int().min(2).max(20).default(4),
    base_name: z.string().min(1).max(32).default(''),
  }),
]);
export type FlowAction = z.infer<typeof FlowActionSchema>;
export type FlowActionType = FlowAction['type'];

// Empty role_ids + user_ids = everyone may trigger; empty channel_ids = anywhere.
export const FlowConditionsSchema = z
  .object({
    role_ids: z.array(z.string()).max(25).default([]),
    user_ids: z.array(z.string()).max(25).default([]),
    channel_ids: z.array(z.string()).max(25).default([]),
  })
  .default({});
export type FlowConditions = z.infer<typeof FlowConditionsSchema>;

// Scheduled runs: either "every X minutes" (1 min – 7 days; the bot's
// scheduler ticks every 60s, so 1 minute is the real floor) or "daily at a
// fixed local time". Output is posted to channel_id (and spoken too when the
// bot sits in a voice channel). A flow may be phrase-triggered, scheduled, or both.
export const FlowScheduleSchema = z
  .object({
    enabled: z.boolean().default(false),
    // 'every' = interval cadence; 'daily' = once a day at `at` local time.
    mode: z.enum(['every', 'daily']).default('every'),
    every_minutes: z.number().int().min(1).max(10080).default(60),
    // 'daily' mode: wall-clock "HH:MM" in the editor's timezone, stored with
    // the UTC offset in minutes EAST of UTC (+180 = UTC+3) captured from the
    // browser — the bot host's own timezone must never matter.
    at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'at must be HH:MM').default('20:00'),
    tz_offset_minutes: z.number().int().min(-720).max(840).default(0),
    // Stop after N runs (0 = unlimited). Run counters live in the bot's
    // schedule bookkeeping and reset whenever the schedule is edited.
    max_runs: z.number().int().min(0).max(1000).default(0),
    channel_id: z.string().default(''),
  })
  .default({});
export type FlowSchedule = z.infer<typeof FlowScheduleSchema>;

const CommandFlowBase = z.object({
  id: idStr, // client-generated (crypto.randomUUID)
  name: z.string().min(1).max(60),
  folder: z.string().max(40).default(''), // '' = root; 'system' is reserved for built-ins
  enabled: z.boolean().default(true),
  sources: z
    .object({ voice: z.boolean().default(true), text: z.boolean().default(false) })
    .default({}),
  triggers: z.array(z.string().min(1).max(100)).max(20),
  schedule: FlowScheduleSchema,
  // exact = whole utterance equals a trigger; prefix = trigger starts the
  // utterance, remainder is captured as {args} / spoken_name.
  match_mode: z.enum(['exact', 'prefix']).default('exact'),
  // Candidate for the LLM intent-classification fallback when no phrase hits.
  llm_fallback: z.boolean().default(true),
  conditions: FlowConditionsSchema,
  actions: z.array(FlowActionSchema).min(1).max(5),
  cooldown_seconds: z.number().int().min(0).max(3600).default(5),
  // Expose this flow as a per-guild Discord slash command under this name;
  // '' = not exposed. Discord command names: 1-32 chars, lowercase, no spaces
  // (\p{Ll} lowercase ASCII/Latin, \p{Lo} covers Arabic and other unicase scripts).
  slash_name: z
    .string()
    .regex(/^$|^[-_\p{Ll}\p{Lo}\p{N}]{1,32}$/u, 'slash_name: lowercase letters/digits/-/_ only, max 32')
    .default(''),
  // Canvas positions of the fixed nodes (actions carry their own pos).
  layout: z
    .object({
      trigger: NodePos.default({ x: 0, y: 120 }),
      condition: NodePos.default({ x: 300, y: 120 }),
    })
    .default({}),
});

// A flow must be reachable somehow: phrase triggers, a schedule, or both.
// An enabled schedule needs an output channel — there is no invocation
// context to reply into.
export const CommandFlowSchema = CommandFlowBase.superRefine((flow, ctx) => {
  if (flow.triggers.length === 0 && !flow.schedule.enabled) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['triggers'], message: 'flow needs phrase triggers or a schedule' });
  }
  if (flow.schedule.enabled && !flow.schedule.channel_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['schedule', 'channel_id'], message: 'scheduled flow needs an output channel' });
  }
  flow.actions.forEach((action, i) => {
    if (!('target' in action) || action.target !== 'member') return;
    // dm_user may target picked members and/or whole roles; every other
    // targeted action needs exactly one picked member.
    const hasMulti =
      action.type === 'dm_user' && (action.target_user_ids.length > 0 || action.target_role_ids.length > 0);
    if (!action.target_user_id && !hasMulti) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actions', i, 'target_user_id'], message: 'pick the member this action targets' });
    }
  });
});
export type CommandFlow = z.infer<typeof CommandFlowSchema>;

export const BuiltinOverrideSchema = z.object({
  enabled: z.boolean().default(true),
  extra_triggers: z.array(z.string().min(1).max(100)).max(20).default([]),
  // Both lists empty = the built-in's default gate (kick: admin, others: everyone).
  role_ids: z.array(z.string()).max(25).default([]),
  user_ids: z.array(z.string()).max(25).default([]),
  layout: z
    .object({ trigger: NodePos, condition: NodePos, action: NodePos })
    .partial()
    .default({}),
});
export type BuiltinOverride = z.infer<typeof BuiltinOverrideSchema>;

// Explicit optional keys instead of z.record — Zod 3 records with enum keys
// infer a full (non-partial) Record, which is wrong for a sparse override map.
export const BuiltinOverridesSchema = z
  .object({
    leave: BuiltinOverrideSchema.optional(),
    stop: BuiltinOverrideSchema.optional(),
    say: BuiltinOverrideSchema.optional(),
    kick: BuiltinOverrideSchema.optional(),
    help: BuiltinOverrideSchema.optional(),
    ping: BuiltinOverrideSchema.optional(),
  })
  .default({});
export type BuiltinOverrides = z.infer<typeof BuiltinOverridesSchema>;

export const SlashOverrideSchema = z.object({
  enabled: z.boolean().default(true),
  // Both lists empty = everyone may use the command.
  role_ids: z.array(z.string()).max(25).default([]),
  user_ids: z.array(z.string()).max(25).default([]),
});
export type SlashOverride = z.infer<typeof SlashOverrideSchema>;

// Sparse map with explicit optional keys, same rationale as BuiltinOverridesSchema.
export const SlashOverridesSchema = z
  .object({
    join: SlashOverrideSchema.optional(),
    leave: SlashOverrideSchema.optional(),
    listen: SlashOverrideSchema.optional(),
    speak: SlashOverrideSchema.optional(),
    ask: SlashOverrideSchema.optional(),
    chat: SlashOverrideSchema.optional(),
    summarize: SlashOverrideSchema.optional(),
    'welcome-test': SlashOverrideSchema.optional(),
    settings: SlashOverrideSchema.optional(),
    ping: SlashOverrideSchema.optional(),
  })
  .default({});
export type SlashOverrides = z.infer<typeof SlashOverridesSchema>;

/** Option name for the optional free-text argument on flow slash commands. */
export const SLASH_TEXT_OPTION = 'text';

export const GuildCommandFlowsSchema = z
  .object({
    flows: z.array(CommandFlowSchema).max(50).default([]),
    builtin_overrides: BuiltinOverridesSchema,
    slash_overrides: SlashOverridesSchema,
    folders: z.array(z.string().min(1).max(40)).max(20).default([]),
  })
  .superRefine((doc, ctx) => {
    // Slash names must be unique and must not shadow the bot's own commands.
    const seen = new Set<string>();
    doc.flows.forEach((flow, i) => {
      if (!flow.slash_name) return;
      if ((SLASH_COMMAND_KEYS as readonly string[]).includes(flow.slash_name)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['flows', i, 'slash_name'], message: `"/${flow.slash_name}" is a built-in command name` });
      } else if (seen.has(flow.slash_name)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['flows', i, 'slash_name'], message: `duplicate slash command "/${flow.slash_name}"` });
      }
      seen.add(flow.slash_name);
    });
  });
export type GuildCommandFlows = z.infer<typeof GuildCommandFlowsSchema>;

// ---------------------------------------------------------------------------
// Matching (pure — shared by the voice router and the text listener)

// Fold like the wake word, then shave leading/trailing punctuation Whisper
// likes to append ("verlasse den kanal." must still hit an exact trigger).
function foldForMatch(s: string): string {
  return normalizeText(s).replace(/^[\s,،.!؟?;:]+|[\s,،.!؟?;:]+$/g, '');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Prefix regex like parseWakeWord: spaces inside the trigger are optional,
// but the args (if any) must be separated — so "kick" never matches "kicks".
function prefixMatch(utterance: string, trigger: string): string | null {
  const body = escapeRe(trigger).replace(/ /g, '\\s*');
  const m = utterance.match(new RegExp(`^${body}(?:[\\s,،.!؟?]+(.*))?$`, 'i'));
  return m ? (m[1] ?? '').trim() : null;
}

export interface FlowMatch {
  flow: CommandFlow;
  args: string;
}

/** First enabled flow (in array order) whose trigger matches the utterance. */
export function matchCustomFlows(
  flows: CommandFlow[],
  utterance: string,
  source: 'voice' | 'text',
): FlowMatch | null {
  const u = foldForMatch(utterance);
  if (!u) return null;
  for (const flow of flows) {
    if (!flow.enabled || !flow.sources[source]) continue;
    for (const trigger of flow.triggers) {
      const w = foldForMatch(trigger);
      if (!w) continue;
      if (flow.match_mode === 'exact') {
        if (u === w) return { flow, args: '' };
      } else {
        const args = prefixMatch(u, w);
        if (args !== null) return { flow, args };
      }
    }
  }
  return null;
}

/**
 * Match an utterance against admin-added extra triggers for built-ins.
 * say/kick behave as prefix (their args are the text/target), the rest exact.
 * Disabled overrides never match. Empty overrides ⇒ always null (built-in
 * behavior stays byte-identical to before this feature).
 */
export function matchBuiltinExtraTriggers(
  overrides: BuiltinOverrides,
  utterance: string,
): { key: BuiltinCommandKey; args: string } | null {
  const u = foldForMatch(utterance);
  if (!u) return null;
  for (const key of BUILTIN_COMMAND_KEYS) {
    const ov = overrides[key];
    if (!ov || !ov.enabled) continue;
    for (const trigger of ov.extra_triggers) {
      const w = foldForMatch(trigger);
      if (!w) continue;
      if (key === 'say' || key === 'kick') {
        const args = prefixMatch(u, w);
        if (args !== null) return { key, args };
      } else if (u === w) {
        return { key, args: '' };
      }
    }
  }
  return null;
}

/** Empty allowlists = everyone. Otherwise user id OR any shared role wins. */
export function isSpeakerAllowed(
  cond: { role_ids: string[]; user_ids: string[] },
  userId: string,
  memberRoleIds: string[],
): boolean {
  if (cond.role_ids.length === 0 && cond.user_ids.length === 0) return true;
  if (cond.user_ids.includes(userId)) return true;
  return cond.role_ids.some((id) => memberRoleIds.includes(id));
}
