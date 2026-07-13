import type { Guild, GuildMember, TextChannel } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { activeUserIds } from '@gamebot/db';
import type { FlowAction, GuildConfig } from '@gamebot/shared';
import { t, fmt } from '../../lib/strings.js';
import { tryConsumeAiQuestion } from '../../lib/quotas.js';
import { getAIProvider } from '../voice-ai/providers.js';
import { resolveKickTarget } from '../voice-ai/kick.js';
import { leaveGuildVoice, type VoiceSession } from '../voice-ai/sessions.js';
import { stopListening } from '../voice-ai/listen.js';

export interface ExecContext {
  guild: Guild;
  invokerId: string;
  /** The full trigger utterance (for ai_reply prompts). */
  utterance: string;
  /** Captured remainder of a 'prefix' trigger ('' for exact matches). */
  args: string;
  source: 'voice' | 'text' | 'schedule';
  /** Active voice session, if any — text commands can steer voice too. */
  session?: VoiceSession;
  /** Text source only: mentioned user ids take priority for spoken_name targets. */
  mentionedUserIds?: string[];
  /**
   * Set when the caller already consumed one AI-quota unit for this question
   * (the router's LLM intent fallback) — the first ai_reply action must not
   * charge a second unit for the same question.
   */
  aiQuotaPrepaid?: boolean;
  config: GuildConfig;
}

/** Member the {mention} placeholder points at: an explicit mention wins, then
 * a member named in the captured args, then the invoker themselves. */
function mentionTargetId(ctx: ExecContext): string {
  const mentioned = ctx.mentionedUserIds?.[0];
  if (mentioned) return mentioned;
  const byName = ctx.args ? resolveKickTarget(ctx.args, voiceChannelMembers(ctx)) : null;
  return byName ?? ctx.invokerId;
}

// mentionAs 'name' is for text that gets SPOKEN via TTS — a raw <@id> tag
// would be read out loud character by character.
function expand(text: string, ctx: ExecContext, mentionAs: 'tag' | 'name' = 'tag'): string {
  const user = ctx.guild.members.cache.get(ctx.invokerId)?.displayName ?? '';
  let mention = '';
  if (text.includes('{mention}')) {
    const id = mentionTargetId(ctx);
    mention = mentionAs === 'name' ? (ctx.guild.members.cache.get(id)?.displayName ?? '') : `<@${id}>`;
  }
  return fmt(text, { user, args: ctx.args, mention });
}

/** User ids of all <@…> tags in a message, so those pings actually fire. */
function mentionedIdsIn(content: string): string[] {
  return [...content.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]).slice(0, 25);
}

/** Members of the voice channel the command concerns (session's, else the invoker's). */
function voiceChannelMembers(ctx: ExecContext): { id: string; displayName: string }[] {
  const channelId =
    ctx.session?.channelId ?? ctx.guild.members.cache.get(ctx.invokerId)?.voice.channelId;
  if (!channelId) return [];
  const channel = ctx.guild.channels.cache.get(channelId);
  if (!channel?.isVoiceBased()) return [];
  return [...channel.members.values()]
    .filter((m) => !m.user.bot)
    .map((m) => ({ id: m.id, displayName: m.displayName }));
}

async function resolveTargetMember(
  action: { target: 'speaker' | 'spoken_name' | 'member'; target_user_id: string },
  ctx: ExecContext,
): Promise<GuildMember | null> {
  if (action.target === 'member') {
    // A member picked in the editor — the only target that also resolves on
    // scheduled runs. Not necessarily cached, so fall back to a fetch.
    if (!action.target_user_id) return null;
    return (
      ctx.guild.members.cache.get(action.target_user_id) ??
      (await ctx.guild.members.fetch(action.target_user_id).catch(() => null))
    );
  }
  if (action.target === 'speaker') return ctx.guild.members.cache.get(ctx.invokerId) ?? null;
  // spoken_name: an explicit mention wins (text source), else fuzzy-match the
  // captured args against voice-channel members like the built-in kick.
  const mentioned = ctx.mentionedUserIds?.[0];
  if (mentioned) return ctx.guild.members.cache.get(mentioned) ?? null;
  const targetId = resolveKickTarget(ctx.args, voiceChannelMembers(ctx));
  return targetId ? (ctx.guild.members.cache.get(targetId) ?? null) : null;
}

function botHas(ctx: ExecContext, flag: bigint): boolean {
  return ctx.guild.members.me?.permissions.has(flag) ?? false;
}

/**
 * Runs a flow's actions sequentially. Each action is isolated — one failure is
 * logged and the chain continues. Returns the accumulated reply text (spoken
 * via TTS for voice, sent as a message reply for text).
 */
export async function executeActions(
  actions: FlowAction[],
  ctx: ExecContext,
): Promise<{ reply: string }> {
  const strings = t(ctx.config.language);
  const replies: string[] = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'voice_leave': {
          // leaveGuildVoice tears down subscriptions + handler itself.
          if (ctx.session) leaveGuildVoice(ctx.guild.id);
          break;
        }
        case 'voice_stop_listening': {
          if (ctx.session) stopListening(ctx.session);
          break;
        }
        case 'voice_disconnect_user': {
          const member = await resolveTargetMember(action, ctx);
          if (!member) { replies.push(strings.kickNoMatch); break; }
          if (member.user.bot || !botHas(ctx, PermissionFlagsBits.MoveMembers)) {
            replies.push(strings.kickFailed);
            break;
          }
          await member.voice.disconnect().catch(() => replies.push(strings.kickFailed));
          break;
        }
        case 'voice_move_user': {
          const member = await resolveTargetMember(action, ctx);
          if (!member) { replies.push(strings.kickNoMatch); break; }
          if (member.user.bot || !botHas(ctx, PermissionFlagsBits.MoveMembers)) {
            replies.push(strings.kickFailed);
            break;
          }
          await member.voice.setChannel(action.channel_id).catch(() => replies.push(strings.kickFailed));
          break;
        }
        case 'speak_tts': {
          replies.push(expand(action.text, ctx, 'name'));
          break;
        }
        case 'send_message': {
          const channel = ctx.guild.channels.cache.get(action.channel_id);
          if (!channel?.isTextBased()) break;
          // 2000 = Discord's hard limit; truncate after placeholder expansion.
          const content = expand(action.text, ctx).slice(0, 2000);
          // Only user tags present in the text may ping — never roles/everyone.
          await (channel as TextChannel)
            .send({ content, allowedMentions: { parse: [], users: mentionedIdsIn(content) } })
            .catch(() => {});
          break;
        }
        case 'timeout_user': {
          const member = await resolveTargetMember(action, ctx);
          if (!member) { replies.push(strings.kickNoMatch); break; }
          // moderatable covers bot permission, role hierarchy and guild owner.
          if (member.user.bot || !member.moderatable) { replies.push(strings.kickFailed); break; }
          await member
            .timeout(action.duration_minutes * 60_000, 'Custom command')
            .catch(() => replies.push(strings.kickFailed));
          break;
        }
        case 'role_add':
        case 'role_remove': {
          const member = await resolveTargetMember(action, ctx);
          if (!member) { replies.push(strings.kickNoMatch); break; }
          const role = ctx.guild.roles.cache.get(action.role_id);
          const me = ctx.guild.members.me;
          if (!role || !me || !botHas(ctx, PermissionFlagsBits.ManageRoles) ||
              role.comparePositionTo(me.roles.highest) >= 0) {
            replies.push(strings.kickFailed);
            break;
          }
          const op = action.type === 'role_add' ? member.roles.add(role) : member.roles.remove(role);
          await op.then(() => undefined, () => replies.push(strings.kickFailed));
          break;
        }
        case 'dm_user': {
          // 'member' may fan out to several picked members + whole roles.
          const multi =
            action.target === 'member' &&
            (action.target_user_ids.length > 0 || action.target_role_ids.length > 0);
          if (!multi) {
            const member = await resolveTargetMember(action, ctx);
            if (!member) { replies.push(strings.kickNoMatch); break; }
            if (member.user.bot) break;
            const text = expand(action.text, ctx).replaceAll('{member}', member.displayName).slice(0, 2000);
            await member.send({ content: text }).catch(() => replies.push(strings.dmFailed));
            break;
          }

          const ids = new Set<string>(action.target_user_ids);
          if (action.target_user_id) ids.add(action.target_user_id);
          if (action.target_role_ids.length > 0) {
            const all = await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache);
            for (const m of all.values()) {
              if (!m.user.bot && action.target_role_ids.some((r) => m.roles.cache.has(r))) ids.add(m.id);
            }
          }
          const targets: GuildMember[] = [];
          for (const id of [...ids].slice(0, 50)) { // hard cap — never a spam cannon
            const m = ctx.guild.members.cache.get(id) ?? (await ctx.guild.members.fetch(id).catch(() => null));
            if (m && !m.user.bot) targets.push(m);
          }
          const text = expand(action.text, ctx);
          // Fire-and-forget with a throttle, same shape as dm_inactive_members —
          // dozens of sequential DMs must not block the reply or poke rate limits.
          void (async () => {
            for (const m of targets) {
              await m.send({ content: text.replaceAll('{member}', m.displayName).slice(0, 2000) }).catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          })();
          replies.push(fmt(strings.dmBulkStarted, { count: targets.length }));
          break;
        }
        case 'dm_inactive_members': {
          // "Inactive" = no recorded message/reaction/voice activity in the window.
          const active = new Set(await activeUserIds(ctx.guild.id, action.days));
          const allMembers = await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache);
          const targets = [...allMembers.values()]
            .filter((m) => !m.user.bot && !active.has(m.id))
            .slice(0, 50); // hard cap per run — this must never become a spam cannon
          const text = expand(action.text, ctx);
          // Fire-and-forget with a generous throttle: 50 sequential DMs would
          // otherwise block the reply for a minute and poke Discord's limits.
          void (async () => {
            for (const m of targets) {
              await m.send({ content: text.replaceAll('{member}', m.displayName).slice(0, 2000) }).catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          })();
          replies.push(fmt(strings.dmInactiveStarted, { count: targets.length }));
          break;
        }
        case 'ai_reply': {
          if (ctx.aiQuotaPrepaid) ctx.aiQuotaPrepaid = false;
          else if (!(await tryConsumeAiQuestion(ctx.guild.id))) { replies.push(strings.aiQuotaExhausted); break; }
          const answer = await getAIProvider()
            .generateResponse(ctx.args || ctx.utterance, {
              systemPrompt: action.system_prompt,
              username: ctx.guild.members.cache.get(ctx.invokerId)?.displayName ?? 'a member',
            })
            .catch(() => strings.aiFailed);
          replies.push(answer);
          break;
        }
      }
    } catch (err) {
      console.error(`[CustomCmd ${ctx.guild.id}] action ${action.type} failed:`, err);
    }
  }

  return { reply: replies.filter(Boolean).join('\n') };
}
