import type { Guild } from 'discord.js';
import { parseWakeWord } from '@gamebot/shared';
import { getSession, playSpeech } from './sessions.js';
import { getAnswerSession } from './answer-session.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { tryConsumeAiQuestion } from '../../lib/quotas.js';
import { t } from '../../lib/strings.js';

/** Mirror a spoken command/quota reply to the moderation/log channel. */
async function mirror(guild: Guild, text: string): Promise<void> {
  const config = await getCachedGuildConfig(guild.id);
  const { resolveModerationChannel } = await import('../protection/voice-mod.js');
  await resolveModerationChannel(guild, config.protection.log_channel_id)
    ?.send(`🤖 ${text}`.slice(0, 2000))
    .catch(() => {});
}

/**
 * V2 orchestration on a REST firehose transcript (the speaker is known per call
 * — no FIFO attribution). The ACTIVE user's live audio is already streaming to
 * the answer session, where server VAD answers directly; this path owns only
 * MODERATION, the active-user LOCK, and built-in/flow commands — never the
 * free-form answer. Conversation TIMING (phase / idle timeout / takeover clock)
 * is driven by the answer session's VAD events, not here.
 *
 * `seedPcm24` is THIS utterance's own audio; on a fresh engage/takeover it is
 * replayed into the answer session so the first (wake) question gets answered.
 */
export async function handleFirehoseTranscript(
  guild: Guild,
  userId: string,
  text: string,
  seedPcm24: Buffer,
): Promise<void> {
  const session = getSession(guild.id);
  if (!session) return;
  const config = await getCachedGuildConfig(guild.id);
  const answer = getAnswerSession(guild.id);
  const speaker = guild.members.cache.get(userId)?.displayName ?? userId;
  console.log(`[Firehose ${guild.id}] STT[${speaker}]="${text}"`);

  // 1. Moderation FIRST, for everyone (checklist #1). If the ACTIVE user is
  //    flagged, cancel the in-flight answer + wipe context (warn/kick already
  //    ran verbatim inside the moderation call).
  const { handleTranscriptModeration } = await import('../protection/voice-mod.js');
  if (await handleTranscriptModeration(guild, session, userId, text)) {
    if (answer?.activeUser === userId) {
      answer.abort();
      answer.clearContext();
    }
    return;
  }

  // 2. Active-user lock (same rules as v1 handleTranscript, minus model-context
  //    deletes — the REST firehose has no context to clean).
  const conv = session.conversation;
  conv.setTimeout(config.voice.follow_up_seconds * 1000);
  const wake = parseWakeWord(text, config.voice.wake_word);
  let isFollowUp: boolean;
  let engaged = false;
  if (wake !== null) {
    const r = conv.onWakeWord(userId, Date.now());
    if (r === 'queued') {
      console.log(`[Queue] ${speaker} is waiting — active user is ${conv.activeUser}`);
      return; // never reached the answer session (not active)
    }
    engaged = r === 'engaged' || r === 'took-over';
    if (engaged) console.log(`[WakeWord] ${speaker} ${r} the floor`);
    isFollowUp = false;
  } else {
    if (!conv.isActive(userId)) return; // not the active speaker
    if (conv.idleDeadline === null) return; // conversation window closed
    isFollowUp = true;
  }

  // 3. Route: built-ins/flows still fire mid-conversation; a free-form question
  //    is owned by the live answer session ({ kind: 'model' }).
  const query = wake ?? text;
  const { routeVoiceCommand } = await import('./router.js');
  const result = await routeVoiceCommand(guild, session, query, userId, { followUp: isFollowUp, mode: 'v2' });

  if (typeof result === 'string') {
    // A built-in/flow reply — a command wins over any live answer.
    answer?.abort();
    if (result) {
      await playSpeech(guild.id, result).catch((e) => console.error('[Firehose] speak:', e));
      await mirror(guild, result);
    }
    conv.onResponseEnd(Date.now());
    return;
  }

  // result.kind === 'model' — the live server-VAD answer owns the reply. Charge
  // the AI quota exactly once here (the router does not, in v2).
  if (!(await tryConsumeAiQuestion(guild.id))) {
    answer?.abort();
    await playSpeech(guild.id, t(config.language).aiQuotaExhausted).catch(() => {});
    conv.onResponseEnd(Date.now());
    return;
  }
  // A fresh engage/takeover: replay THIS wake utterance so the model answers the
  // first question. A follow-up is already streaming live — nothing to seed.
  if (engaged) answer?.setActiveUser(userId, speaker, seedPcm24);
}
