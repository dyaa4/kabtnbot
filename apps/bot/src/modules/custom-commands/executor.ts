import type { Guild, GuildMember, TextChannel, VoiceBasedChannel } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { activeUserIds } from '@gamebot/db';
import { JOIN_BUSIEST_CHANNEL, type FlowAction, type GuildConfig } from '@gamebot/shared';
import { t, fmt } from '../../lib/strings.js';
import { tryConsumeAiQuestion } from '../../lib/quotas.js';
import { getAIProvider } from '../voice-ai/providers.js';
import { resolveKickTarget } from '../voice-ai/kick.js';
import { joinGuildVoice, leaveGuildVoice, type VoiceSession } from '../voice-ai/sessions.js';
import { startListening, stopListening } from '../voice-ai/listen.js';

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

/**
 * Replace the {member} placeholder with a per-recipient display name. Uses a
 * function replacer (NOT String.replaceAll's string form) so a display name
 * containing `$&`, `$1`, `$$`… is inserted verbatim instead of triggering
 * replacement-pattern substitution and garbling the message. Exported for tests.
 */
export function fillMember(text: string, displayName: string): string {
  return text.replace(/\{member\}/g, () => displayName);
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
 * The joinable voice channel with the most HUMAN members (bots don't count,
 * ties keep the first seen). Respects the guild's allowed-channels list and
 * never returns an empty channel — joining nobody is pointless.
 */
function busiestVoiceChannel(ctx: ExecContext): VoiceBasedChannel | undefined {
  const allowed = ctx.config.voice.allowed_channel_ids;
  let best: VoiceBasedChannel | undefined;
  let bestCount = 0;
  for (const ch of ctx.guild.channels.cache.values()) {
    if (!ch.isVoiceBased() || !ch.joinable) continue;
    if (allowed.length > 0 && !allowed.includes(ch.id)) continue;
    const count = [...ch.members.values()].filter((m) => !m.user.bot).length;
    if (count > bestCount) {
      best = ch;
      bestCount = count;
    }
  }
  return best;
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
        case 'voice_join': {
          // '@busiest' = the fullest voice channel; a picked channel wins
          // otherwise; '' falls back to the invoker's current voice channel.
          let channel: VoiceBasedChannel | undefined;
          if (action.channel_id === JOIN_BUSIEST_CHANNEL) {
            channel = busiestVoiceChannel(ctx);
          } else {
            const channelId =
              action.channel_id || ctx.guild.members.cache.get(ctx.invokerId)?.voice.channelId;
            const ch = channelId ? ctx.guild.channels.cache.get(channelId) : undefined;
            channel = ch?.isVoiceBased() ? ch : undefined;
          }
          if (!channel) { replies.push(strings.voiceJoinFailed); break; }
          // Same gate as /join — an automation must not drag the bot into a
          // channel the admins excluded in the settings.
          if (
            ctx.config.voice.allowed_channel_ids.length > 0 &&
            !ctx.config.voice.allowed_channel_ids.includes(channel.id)
          ) {
            replies.push(strings.channelNotAllowed);
            break;
          }
          if (ctx.session?.channelId === channel.id) break; // already there
          try {
            const session = await joinGuildVoice(channel);
            // Later actions in this run (TTS, voice chat, kicks) must see the
            // fresh session, not the pre-join snapshot.
            ctx.session = session;
            // Quota-gated like /join; a false return means the bot sits in the
            // channel without listening — intentional, the join itself succeeded.
            await startListening(session, ctx.guild, ctx.invokerId);
          } catch {
            replies.push(strings.voiceJoinFailed);
          }
          break;
        }
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
        case 'send_voice_chat': {
          // The voice channel's built-in text chat: the active session's
          // channel, else the channel the invoker is sitting in. Voice
          // channels are text-based in discord.js, so .send works directly.
          const channelId =
            ctx.session?.channelId ?? ctx.guild.members.cache.get(ctx.invokerId)?.voice.channelId;
          const channel = channelId ? ctx.guild.channels.cache.get(channelId) : undefined;
          if (!channel?.isVoiceBased()) break;
          const content = expand(action.text, ctx).slice(0, 2000);
          await channel
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
            const text = fillMember(expand(action.text, ctx), member.displayName).slice(0, 2000);
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
              await m.send({ content: fillMember(text, m.displayName).slice(0, 2000) }).catch(() => {});
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
              await m.send({ content: fillMember(text, m.displayName).slice(0, 2000) }).catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          })();
          replies.push(fmt(strings.dmInactiveStarted, { count: targets.length }));
          break;
        }
        case 'dm_all_members': {
          const allMembers = await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache);
          const targets = [...allMembers.values()].filter((m) => !m.user.bot).slice(0, 100);
          const text = expand(action.text, ctx);
          void (async () => {
            for (const m of targets) {
              await m.send({ content: fillMember(text, m.displayName).slice(0, 2000) }).catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          })();
          replies.push(fmt(strings.dmAllStarted, { count: targets.length }));
          break;
        }
        case 'dm_online_members': {
          const allMembers = await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache);
          // presence.status is only available with the GUILD_PRESENCES intent.
          // Fallback: treat members in a voice channel as "online" when
          // presence data is unavailable (presence === null for everyone).
          const hasPresenceData = [...allMembers.values()].some((m) => m.presence !== null);
          const targets = [...allMembers.values()]
            .filter((m) => {
              if (m.user.bot) return false;
              if (hasPresenceData) {
                return m.presence?.status && m.presence.status !== 'offline';
              }
              // Fallback: member is "online" if they're in a voice channel.
              return !!m.voice.channelId;
            })
            .slice(0, 100);
          const text = expand(action.text, ctx);
          void (async () => {
            for (const m of targets) {
              await m.send({ content: fillMember(text, m.displayName).slice(0, 2000) }).catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          })();
          replies.push(fmt(strings.dmOnlineStarted, { count: targets.length }));
          break;
        }
        case 'voice_distribute': {
          const channelId =
            ctx.session?.channelId ?? ctx.guild.members.cache.get(ctx.invokerId)?.voice.channelId;
          const sourceChannel = channelId ? ctx.guild.channels.cache.get(channelId) : undefined;
          if (!sourceChannel?.isVoiceBased()) { replies.push(strings.voiceJoinFailed); break; }
          const humans = [...sourceChannel.members.values()].filter((m) => !m.user.bot);
          if (humans.length < 2) { replies.push(strings.distributeNotEnough); break; }
          if (!botHas(ctx, PermissionFlagsBits.MoveMembers)) {
            replies.push(strings.kickFailed); break;
          }
          const name = action.base_name || '';
          const targetChannels = [...ctx.guild.channels.cache.values()]
            .filter((ch): ch is VoiceBasedChannel =>
              ch.isVoiceBased() && ch.id !== sourceChannel.id && name !== '' && ch.name.includes(name),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
          if (targetChannels.length === 0) { replies.push(strings.distributeNoChannels); break; }
          // Shuffle members randomly.
          const shuffled = [...humans];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          const size = action.group_size;
          let moved = 0;
          for (let i = 0; i < shuffled.length; i += size) {
            const channelIdx = Math.floor(i / size);
            if (channelIdx >= targetChannels.length) break;
            const chunk = shuffled.slice(i, i + size);
            for (const member of chunk) {
              await member.voice.setChannel(targetChannels[channelIdx].id).catch(() => {});
              moved++;
            }
          }
          replies.push(fmt(strings.distributeDone, { count: String(moved) }));
          break;
        }
        case 'ai_reply': {
          if (ctx.aiQuotaPrepaid) ctx.aiQuotaPrepaid = false;
          else if (!(await tryConsumeAiQuestion(ctx.guild.id, ctx.invokerId))) { replies.push(strings.aiQuotaExhausted); break; }
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
