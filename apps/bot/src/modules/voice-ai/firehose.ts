import type { Guild } from 'discord.js';
import { parseWakeWord } from '@gamebot/shared';
import { voiceEngineGroq } from '../../config.js';
import { getSession, playSpeech, stopPlayback } from './sessions.js';
import { getAnswerSession } from './answer-session.js';
import { generateAnswer, pushHistory } from './groq-answer.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { tryConsumeAiQuestion, isAiQuotaExhausted } from '../../lib/quotas.js';
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
 * — no FIFO attribution). Owns MODERATION, the active-user LOCK, and
 * built-in/flow commands.
 *
 * The free-form answer is fulfilled by the active engine:
 *  - groq (default): Groq Llama writes the reply text, ElevenLabs speaks it —
 *    all here, no OpenAI. Conversation timing is driven directly.
 *  - openai: the live server-VAD answer session speaks; timing comes from its
 *    VAD events. `seedPcm24` (this utterance's audio) is replayed so the first
 *    wake question gets answered.
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
  const answer = getAnswerSession(guild.id); // undefined in groq mode
  const speaker = guild.members.cache.get(userId)?.displayName ?? userId;
  console.log(`[Firehose ${guild.id}] STT[${speaker}]="${text}"`);

  // 1. Moderation FIRST, for everyone. If the ACTIVE user is flagged, kill the
  //    in-flight answer (warn/kick already ran verbatim inside moderation).
  const { handleTranscriptModeration } = await import('../protection/voice-mod.js');
  if (await handleTranscriptModeration(guild, session, userId, text)) {
    if (session.conversation.isActive(userId)) {
      if (voiceEngineGroq) { stopPlayback(guild.id); session.voiceHistory.length = 0; }
      else if (answer?.activeUser === userId) { answer.abort(); answer.clearContext(); }
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
    // A takeover replaces the speaker → wipe the previous conversation's history
    // so nothing bleeds across users (context isolation).
    if (r === 'took-over') session.voiceHistory.length = 0;
    if (engaged) console.log(`[WakeWord] ${speaker} ${r} the floor`);
    isFollowUp = false;
  } else {
    if (!conv.isActive(userId)) return; // not the active speaker
    if (conv.idleDeadline === null) return; // conversation window closed
    isFollowUp = true;
  }

  // 3. Route: built-ins/flows still fire mid-conversation; a free-form question
  //    is owned by the active engine ({ kind: 'model' }).
  const query = wake ?? text;
  const { routeVoiceCommand } = await import('./router.js');
  const result = await routeVoiceCommand(guild, session, query, userId, { followUp: isFollowUp, mode: 'v2' });

  if (typeof result === 'string') {
    // A built-in/flow reply — a command wins over any live answer.
    if (voiceEngineGroq) stopPlayback(guild.id);
    else answer?.abort();
    if (result) {
      // Flow and built-in confirmations are spoken output like any other, so
      // they stop once the monthly allowance is gone. The action itself has
      // already run and the mirror still records it — only the voice is cut.
      if (!(await isAiQuotaExhausted(guild.id, userId))) {
        await playSpeech(guild.id, result).catch((e) => console.error('[Firehose] speak:', e));
      }
      await mirror(guild, result);
    }
    conv.onResponseEnd(Date.now());
    return;
  }

  // result.kind === 'model' — a free-form question. Charge the AI quota once.
  if (!(await tryConsumeAiQuestion(guild.id, userId))) {
    if (voiceEngineGroq) stopPlayback(guild.id);
    else answer?.abort();
    await playSpeech(guild.id, t(config.language).aiQuotaExhausted).catch(() => {});
    conv.onResponseEnd(Date.now());
    return;
  }

  if (voiceEngineGroq) {
    // Groq Llama → ElevenLabs, all here. Barge-in: cut any current playback.
    stopPlayback(guild.id);
    conv.onActiveUtterance(); // → Thinking
    const reply = await generateAnswer(guild, config, query, userId, session.voiceHistory);
    if (!reply) { conv.onResponseEnd(Date.now()); return; }
    pushHistory(session.voiceHistory, query, reply);
    conv.onResponseStart(); // → Speaking
    await playSpeech(guild.id, reply).catch((e) => console.error('[Firehose] speak:', e));
    await mirror(guild, reply);
    conv.onResponseEnd(Date.now());
    return;
  }

  // openai engine: a fresh engage/takeover replays THIS wake utterance so the
  // model answers the first question. A follow-up is already streaming live.
  if (engaged) answer?.setActiveUser(userId, speaker, seedPcm24);
}
