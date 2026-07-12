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

// Who an action operates on: the speaker/author of the trigger, or a name
// captured after a 'prefix' trigger (resolved against voice-channel members
// like the built-in kick).
const Target = z.enum(['speaker', 'spoken_name']).default('speaker');

const actionBase = { id: idStr, pos: NodePos.default({ x: 0, y: 0 }) };

export const FlowActionSchema = z.discriminatedUnion('type', [
  z.object({ ...actionBase, type: z.literal('voice_leave') }),
  z.object({ ...actionBase, type: z.literal('voice_stop_listening') }),
  z.object({ ...actionBase, type: z.literal('voice_disconnect_user'), target: Target }),
  z.object({ ...actionBase, type: z.literal('voice_move_user'), target: Target, channel_id: z.string().min(1) }),
  // {user} = invoker display name, {args} = captured remainder of a prefix trigger
  z.object({ ...actionBase, type: z.literal('speak_tts'), text: z.string().min(1).max(500) }),
  z.object({ ...actionBase, type: z.literal('send_message'), channel_id: z.string().min(1), text: z.string().min(1).max(2000) }),
  z.object({ ...actionBase, type: z.literal('timeout_user'), target: Target, duration_minutes: z.number().int().min(1).max(10080) }),
  z.object({ ...actionBase, type: z.literal('role_add'), target: Target, role_id: z.string().min(1) }),
  z.object({ ...actionBase, type: z.literal('role_remove'), target: Target, role_id: z.string().min(1) }),
  z.object({ ...actionBase, type: z.literal('ai_reply'), system_prompt: z.string().min(1).max(2000) }),
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

export const CommandFlowSchema = z.object({
  id: idStr, // client-generated (crypto.randomUUID)
  name: z.string().min(1).max(60),
  folder: z.string().max(40).default(''), // '' = root; 'system' is reserved for built-ins
  enabled: z.boolean().default(true),
  sources: z
    .object({ voice: z.boolean().default(true), text: z.boolean().default(false) })
    .default({}),
  triggers: z.array(z.string().min(1).max(100)).min(1).max(20),
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
