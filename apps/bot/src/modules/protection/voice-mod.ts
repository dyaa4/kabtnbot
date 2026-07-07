import type { Guild, TextChannel } from 'discord.js';
import { findProfanity } from '@gamebot/shared';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { t, fmt } from '../../lib/strings.js';
import { playSpeech, type VoiceSession } from '../voice-ai/sessions.js';

// --- Strike tracking (warn-then-kick) --------------------------------------
// A single Whisper transcription is noisy, so we never kick on the first hit.
// First profane utterance → spoken + text WARNING. A repeat within the window →
// kick. A short cooldown swallows duplicate/echoed transcriptions of the SAME
// utterance so a failed kick (role hierarchy) can't spin into a kick loop.
export interface StrikeState {
  count: number;
  lastAt: number;
}

const STRIKE_WINDOW_MS = 5 * 60_000; // strikes older than this reset to zero
const COOLDOWN_MS = 8_000; // ignore repeat matches from the same user this soon
const KICK_THRESHOLD = 2; // warn on strike 1, kick from strike 2 on

const strikes = new Map<string, StrikeState>();

/** Test hook: clear all accumulated strikes. */
export function resetModerationState(): void {
  strikes.clear();
}

/**
 * Pure strike-state transition. `cooldown` = seen too recently, do nothing (this
 * is the anti-loop guard). Otherwise the strike count advances and the caller
 * warns (below threshold) or kicks (at/above threshold).
 */
export function nextStrike(
  prev: StrikeState | undefined,
  now: number,
  kickThreshold: number = KICK_THRESHOLD,
): { state: StrikeState; action: 'cooldown' | 'warn' | 'kick' } {
  if (prev && now - prev.lastAt < COOLDOWN_MS) return { state: prev, action: 'cooldown' };
  const base = prev && now - prev.lastAt <= STRIKE_WINDOW_MS ? prev.count : 0;
  const state = { count: base + 1, lastAt: now };
  return { state, action: state.count >= kickThreshold ? 'kick' : 'warn' };
}

/**
 * Where to post a visible moderation notice: the configured log channel if it
 * exists and is text-based, else the guild's system channel, else the first
 * usable text channel. Returns null if nothing usable exists.
 */
export function resolveModerationChannel(
  guild: Guild,
  logChannelId: string | null,
): { send: (content: string) => Promise<unknown> } | null {
  const isText = (c: unknown): c is TextChannel =>
    !!c && typeof (c as { isTextBased?: () => boolean }).isTextBased === 'function' && (c as TextChannel).isTextBased();

  if (logChannelId) {
    const c = guild.channels.cache.get(logChannelId);
    if (isText(c)) return c as unknown as { send: (content: string) => Promise<unknown> };
  }
  if (isText(guild.systemChannel)) {
    return guild.systemChannel as unknown as { send: (content: string) => Promise<unknown> };
  }
  for (const c of guild.channels.cache.values()) {
    if (isText(c)) return c as unknown as { send: (content: string) => Promise<unknown> };
  }
  return null;
}

export async function handleTranscriptModeration(
  guild: Guild,
  _session: VoiceSession,
  userId: string,
  text: string,
  now: number = Date.now(),
): Promise<boolean> {
  const config = await getCachedGuildConfig(guild.id);
  if (!config.protection.enabled || !config.protection.voice_moderation) {
    console.log(
      `[Mod ${guild.id}] skip: protection.enabled=${config.protection.enabled} voice_moderation=${config.protection.voice_moderation}`,
    );
    return false;
  }
  const matched = findProfanity(text, config.protection.custom_words);
  if (!matched) {
    console.log(`[Mod ${guild.id}] no match: "${text}" (custom_words=${JSON.stringify(config.protection.custom_words)})`);
    return false;
  }

  // Advance the strike counter. `cooldown` means we already reacted to this
  // speaker moments ago — swallow the duplicate so we never loop-kick. The
  // cooldown applies in BOTH modes, so even immediate-kick can't loop.
  const key = `${guild.id}:${userId}`;
  const threshold = config.protection.voice_kick_immediately ? 1 : KICK_THRESHOLD;
  const { state, action } = nextStrike(strikes.get(key), now, threshold);
  strikes.set(key, state);
  console.log(`[Mod ${guild.id}] matched word="${matched}" user=${userId} strike=${state.count} action=${action}`);
  if (action === 'cooldown') return true;

  const member = guild.members.cache.get(userId);
  const name = member?.displayName ?? 'عضو';
  const channel = resolveModerationChannel(guild, config.protection.log_channel_id);
  const strings = t(config.language);

  // First offense within the window → warn only. A single noisy transcription
  // can't cost an innocent member their seat; only a repeat escalates.
  if (action === 'warn') {
    await channel
      ?.send(fmt(strings.voiceWarnNotice, { user: `<@${userId}>` }))
      .catch((e) => console.error('[Mod] send failed (needs Send Messages perm?):', (e as Error)?.message ?? e));
    // Spoken line stays Arabic on purpose: the voice assistant (TTS) is Arabic-only.
    await playSpeech(guild.id, `يا ${name}، انتبه لألفاظك، هذا تحذير. التكرار سيؤدي إلى إخراجك.`).catch(() => {});
    return true;
  }

  // Repeat offense → kick. Bail if the member vanished from cache so we never
  // announce a kick that didn't happen.
  if (!member) {
    console.error(`[Mod ${guild.id}] cannot kick ${userId}: member not in cache`);
    return true;
  }

  // Attempt the kick FIRST, then post a notice reflecting what actually happened.
  // A disconnect can fail on role hierarchy (bot role must be above the target)
  // or a missing Move Members permission — surface that instead of falsely
  // claiming the member was removed.
  let kicked = false;
  try {
    await member.voice.disconnect();
    kicked = true;
  } catch (e) {
    console.error('[Mod] disconnect failed (role hierarchy / Move Members perm):', (e as Error)?.message ?? e);
  }

  const notice = kicked
    ? fmt(strings.voiceKickedNotice, { user: `<@${userId}>` })
    : fmt(strings.voiceKickFailedNotice, { user: `<@${userId}>` });
  await channel?.send(notice).catch((e) => console.error('[Mod] send failed (needs Send Messages perm?):', (e as Error)?.message ?? e));
  // Keep the strike record (do NOT clear it): the cooldown it carries is what
  // stops duplicate/echoed transcripts of this same utterance from kicking
  // again. It goes stale on its own after STRIKE_WINDOW_MS.
  if (kicked) await playSpeech(guild.id, `يا ${name}، تم إخراجك بسبب الألفاظ غير اللائقة.`).catch(() => {});
  return true;
}
