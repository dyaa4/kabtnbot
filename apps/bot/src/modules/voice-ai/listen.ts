import OpusScript from 'opusscript';
import { EndBehaviorType } from '@discordjs/voice';
import type { Guild, VoiceState } from 'discord.js';
import { parseWakeWord } from '@gamebot/shared';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { addListenSeconds, isListenQuotaExceeded } from '../../lib/quotas.js';
import { playSpeech, playPcmStream, type VoiceSession, getSession } from './sessions.js';
import { ensureRealtime, getRealtime } from './realtime.js';
import { downmixStereoToMono, downsample48to24, normalizeQuietAudio, pcmPeak } from './audio-util.js';
import { t } from '../../lib/strings.js';

const SAMPLE_RATE = 48000;
const OPUS_CHANNELS = 2;
const FRAME_SECONDS = 0.02; // one Opus frame ≈ 20 ms

// ── Noise gate ──────────────────────────────────────────────────────────
// Discord's voice-activity mode also transmits breathing, keyboard clicks and
// background hum. Those blips used to reach transcription, where the
// wake-word decode hint makes the model HALLUCINATE the wake word out of pure
// noise — the bot then "answers" someone who never spoke. Anything shorter
// than a spoken word or too quiet to be speech is dropped BEFORE quota
// accounting and transcription. (normalizeQuietAudio would otherwise happily
// amplify a whisper-quiet hum to 80% full scale.)
const MIN_UTTERANCE_FRAMES = 15; // 300ms — the shortest real word
const NOISE_FLOOR_PEAK = 1200; // ~3.7% full scale — below this is not speech

// Self-deafen mirrors the listening state in the Discord UI: a crossed-out
// headset shows members the bot genuinely cannot receive audio. A deafened
// bot hears nothing, so resuming has to come from outside voice (/listen).
function setSelfDeaf(session: VoiceSession, deaf: boolean): void {
  try {
    session.connection.rejoin({ channelId: session.channelId, selfDeaf: deaf, selfMute: false });
  } catch { /* connection already destroyed (leave path) */ }
}

export async function startListening(session: VoiceSession, guild: Guild): Promise<boolean> {
  if (session.listening) return true;
  if (await isListenQuotaExceeded(guild.id)) {
    const { language } = await getCachedGuildConfig(guild.id);
    await playSpeech(guild.id, t(language).listenQuotaExhausted).catch(() => {});
    return false;
  }

  // The realtime session transcribes EVERY utterance — profanity moderation
  // depends on it, so listening without it is not allowed.
  let client;
  try {
    client = await ensureRealtime(guild.id, guild);
  } catch (err) {
    console.error(`[Listen ${guild.id}] realtime unavailable:`, (err as Error)?.message ?? err);
    return false;
  }
  client.callbacks = {
    onTranscript: (userId, itemId, text) => {
      handleTranscript(guild, userId, itemId, text)
        .catch((err) => console.error(`[Listen ${guild.id}]`, err));
    },
    onAnswerText: (text) => {
      mirrorAnswer(guild, text).catch(() => {});
    },
    openAudioSink: () => playPcmStream(guild.id),
  };

  session.listening = true;
  setSelfDeaf(session, false);

  const members = guild.members.cache.filter(
    (m) => m.voice.channelId === session.channelId && !m.user.bot,
  );
  for (const [id] of members) subscribeToUser(session, guild, id);
  console.log(`[Listen ${guild.id}] listening to ${members.size} member(s) in ${session.channelId}`);

  const onVoiceState = (_old: VoiceState, next: VoiceState) => {
    const live = getSession(guild.id);
    if (!live?.listening || next.channelId !== live.channelId || next.member?.user.bot) return;
    subscribeToUser(live, guild, next.id);
  };
  guild.client.on('voiceStateUpdate', onVoiceState);

  // Belt and braces: Discord's own speaking signal. If the member cache was
  // stale at join time or a voice-state event was missed, the moment anyone
  // actually TALKS we subscribe — nobody can be silently unheard.
  // (subscribeToUser is idempotent per user, so double signals are free.)
  const onSpeakingStart = (userId: string) => {
    const live = getSession(guild.id);
    if (!live?.listening) return;
    const member = guild.members.cache.get(userId);
    if (member && (member.user.bot || member.voice.channelId !== live.channelId)) return;
    subscribeToUser(live, guild, userId);
  };
  session.connection.receiver.speaking.on('start', onSpeakingStart);

  session.removeVoiceHandler = () => {
    guild.client.removeListener('voiceStateUpdate', onVoiceState);
    session.connection.receiver.speaking.removeListener('start', onSpeakingStart);
  };
  return true;
}

export function stopListening(session: VoiceSession): void {
  session.listening = false;
  session.removeVoiceHandler?.();
  session.removeVoiceHandler = undefined;
  for (const { decoder, stream } of session.subscriptions.values()) {
    stream.destroy();
    decoder.delete();
  }
  session.subscriptions.clear();
  // The realtime WS stays open on purpose: /listen resumes with the
  // conversation memory intact, and the idle timer caps the cost.
  setSelfDeaf(session, true);
}

/**
 * Runs for every transcribed utterance (wired as the realtime onTranscript
 * callback): moderation first, then wake-word gating, then command routing.
 * Utterances that don't address the bot are deleted from the model's context —
 * conversation memory holds only real questions and answers.
 */
export async function handleTranscript(
  guild: Guild, userId: string, itemId: string, text: string,
): Promise<void> {
  const session = getSession(guild.id);
  if (!session) return;
  const config = await getCachedGuildConfig(guild.id);
  const client = getRealtime(guild.id);
  console.log(`[Voice ${guild.id}] STT="${text}"`);

  const { handleTranscriptModeration } = await import('../protection/voice-mod.js');
  // moderated → no reply, and the profanity never enters the model context.
  if (await handleTranscriptModeration(guild, session, userId, text)) {
    client?.deleteItem(itemId);
    return;
  }

  let query = parseWakeWord(text, config.voice.wake_word);
  // Follow-up window: after addressing the bot once, the same speaker keeps
  // the conversation open for follow_up_seconds — no wake word needed.
  const windowMs = config.voice.follow_up_seconds * 1000;
  let isFollowUp = false;
  if (query === null && windowMs > 0 && text.trim()) {
    const fu = session.followUp;
    if (fu && fu.userId === userId && Date.now() < fu.until) {
      // Talk that overlaps the bot's own answer is a reaction, not a question —
      // answering it queues reply after reply and the voices trample each
      // other. Only an explicit wake word may interrupt an active response.
      if (client?.isResponding()) {
        console.log(`[Voice ${guild.id}] follow-up dropped (bot is speaking)`);
        client.deleteItem(itemId);
        return;
      }
      query = text;
      isFollowUp = true;
      console.log(`[Voice ${guild.id}] follow-up (${Math.round((fu.until - Date.now()) / 1000)}s left)`);
    }
  }
  console.log(`[Voice ${guild.id}] wake="${config.voice.wake_word}" ${query === null ? 'NO-MATCH' : `query="${query}"`}`);
  if (query === null) {
    client?.deleteItem(itemId);
    return;
  }
  // Only a wake-word utterance opens/extends the window (bare wake word too —
  // "يا كابتن" … pause … question is the natural flow). Follow-ups must NOT
  // extend it: one hallucinated wake word out of a noisy mic would otherwise
  // start a self-sustaining loop where every answered noise transcript keeps
  // the window open — the window has to decay on its own.
  if (windowMs > 0 && !isFollowUp) session.followUp = { userId, until: Date.now() + windowMs };

  const { routeVoiceCommand } = await import('./router.js');
  const answer = await routeVoiceCommand(guild, session, query, userId, { followUp: isFollowUp });
  // streamed: the answer audio comes straight from the realtime session and
  // onAnswerText mirrors its transcript to the log channel.
  if (typeof answer !== 'string') return;
  if (answer) {
    // Best-effort spoken reply...
    await playSpeech(guild.id, answer).catch((e) => console.error('[Listen] speak:', e));
    // ...and always a text reply so the answer is visible without TTS.
    await mirrorAnswer(guild, answer);
  }
}

/** Posts a spoken answer as text to the moderation/log channel. */
async function mirrorAnswer(guild: Guild, text: string): Promise<void> {
  const config = await getCachedGuildConfig(guild.id);
  const { resolveModerationChannel } = await import('../protection/voice-mod.js');
  await resolveModerationChannel(guild, config.protection.log_channel_id)
    ?.send(`🤖 ${text}`.slice(0, 2000))
    .catch(() => {});
}

/**
 * Whether a closed subscription should be renewed: only for a non-bot member
 * still in THIS voice channel. A speaker who left must NOT be renewed — the
 * fresh AfterSilence subscription would never receive a packet to end on,
 * leaking a decoder + stream per departure. Safe to gate here because a rejoin
 * re-subscribes via voiceStateUpdate and talking via the speaking-start signal.
 * Pure + exported for tests.
 */
export function shouldRenewSubscription(session: VoiceSession, guild: Guild, userId: string): boolean {
  if (!session.listening) return false;
  const member = guild.members.cache.get(userId);
  return Boolean(member && !member.user.bot && member.voice.channelId === session.channelId);
}

function subscribeToUser(session: VoiceSession, guild: Guild, userId: string): void {
  if (!session.listening || session.subscriptions.has(userId)) return;

  const decoder = new OpusScript(SAMPLE_RATE, OPUS_CHANNELS, OpusScript.Application.AUDIO);
  const pcmFrames: Buffer[] = [];
  let totalFrames = 0;

  const stream = session.connection.receiver.subscribe(userId, {
    // Shorter silence window = the utterance reaches transcription sooner
    // after the speaker stops, so moderation/kick reacts faster. Too low would
    // split normal sentences mid-word; 500ms is a snappy-but-safe balance.
    end: { behavior: EndBehaviorType.AfterSilence, duration: 500 },
  });
  session.subscriptions.set(userId, { decoder, stream });

  // ── Subscription lifecycle ─────────────────────────────────────────────
  // There is exactly ONE cleanup-and-renewal point: the stream's 'close'
  // event. Every path funnels into it — 'end' (silence) auto-destroys the
  // readable, 'error' is destroyed explicitly below, stopListening destroys
  // all streams. Renewing any EARLIER is the "answers only once" bug:
  // @discordjs/voice keeps its internal per-user registration until 'close'
  // (receiver.subscriptions.delete fires on 'close'), so a subscribe() from
  // the 'end' handler returns this very stream — already ended, forever
  // silent — and the member goes permanently deaf.
  //
  // 'close' fires milliseconds after the utterance ends, long before the
  // reply finishes, so the renewed subscription still captures anything
  // said while the bot is thinking or talking.
  let decoderFreed = false;
  const freeDecoder = () => {
    if (decoderFreed) return;
    decoderFreed = true;
    try {
      decoder.delete();
    } catch { /* already freed by stopListening's sweep */ }
  };

  stream.once('close', () => {
    freeDecoder();
    // Only OUR map entry — never a successor's.
    if (session.subscriptions.get(userId)?.stream === stream) session.subscriptions.delete(userId);
    if (shouldRenewSubscription(session, guild, userId)) subscribeToUser(session, guild, userId);
  });

  stream.on('data', (chunk: Buffer) => {
    if (!session.listening) { stream.destroy(); return; }
    try {
      const pcm = decoder.decode(chunk);
      if (pcm.length > 0) { pcmFrames.push(pcm); totalFrames++; }
    } catch { /* skip broken frame */ }
  });

  stream.on('end', () => {
    onUtteranceEnd().catch((err) => console.error(`[Listen ${guild.id}]`, err));
  });
  // Funnel failures into the single 'close' path above.
  stream.on('error', () => stream.destroy());

  async function onUtteranceEnd(): Promise<void> {
    // Cleanup and renewal belong to 'close' — this function only ships
    // whatever audio the stream captured.
    if (!session.listening || totalFrames === 0) return;
    if (totalFrames < MIN_UTTERANCE_FRAMES) return;
    const mono = downmixStereoToMono(Buffer.concat(pcmFrames));
    const peak = pcmPeak(mono);
    if (peak < NOISE_FLOOR_PEAK) {
      console.log(`[Listen ${guild.id}] gate: dropped ${Math.round(totalFrames * FRAME_SECONDS * 1000)}ms noise (peak=${peak})`);
      return;
    }
    normalizeQuietAudio(mono);

    try {
      await addListenSeconds(guild.id, totalFrames * FRAME_SECONDS);
      if (await isListenQuotaExceeded(guild.id)) {
        stopListening(session);
        const { language } = await getCachedGuildConfig(guild.id);
        await playSpeech(guild.id, t(language).listenQuotaExhausted).catch(() => {});
        return;
      }
      // Transcription + moderation + wake-word handling continue in
      // handleTranscript once the realtime server returns the transcript.
      getRealtime(guild.id)?.sendUtterance(downsample48to24(mono), userId);
    } catch (err) {
      console.error(`[Listen ${guild.id}]`, err);
    }
  }
}
