import OpusScript from 'opusscript';
import { EndBehaviorType } from '@discordjs/voice';
import type { Guild, VoiceState } from 'discord.js';
import { parseWakeWord, type GuildCommandFlows } from '@gamebot/shared';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { getCachedCommandFlows } from '../../lib/flows-cache.js';
import { transcribe } from './stt.js';
import { pcmToWav } from './wav.js';
import { addListenSeconds, isListenQuotaExceeded } from '../../lib/quotas.js';
import { playSpeech, type VoiceSession, getSession } from './sessions.js';
import { t } from '../../lib/strings.js';

const SAMPLE_RATE = 48000;
const OPUS_CHANNELS = 2;
const FRAME_SECONDS = 0.02; // one Opus frame ≈ 20 ms

// Self-deafen mirrors the listening state in the Discord UI: a crossed-out
// headset shows members the bot genuinely cannot receive audio. A deafened
// bot hears nothing, so resuming has to come from outside voice (/listen).
function setSelfDeaf(session: VoiceSession, deaf: boolean): void {
  try {
    session.connection.rejoin({ channelId: session.channelId, selfDeaf: deaf, selfMute: false });
  } catch { /* connection already destroyed (leave path) */ }
}

/**
 * Whisper biases decoding toward its prompt, so seed it with the EXACT words
 * it must recognize: the wake word plus the guild's enabled trigger phrases.
 * Capped well under Whisper's 224-token prompt limit.
 */
export function sttHint(wakeWord: string, flows: GuildCommandFlows | null): string {
  const phrases = (flows?.flows ?? [])
    .filter((f) => f.enabled && f.sources.voice)
    .flatMap((f) => f.triggers)
    .slice(0, 12);
  return [wakeWord, ...phrases].join('، ').slice(0, 300);
}

export async function startListening(session: VoiceSession, guild: Guild): Promise<boolean> {
  if (session.listening) return true;
  if (await isListenQuotaExceeded(guild.id)) {
    const { language } = await getCachedGuildConfig(guild.id);
    await playSpeech(guild.id, t(language).listenQuotaExhausted).catch(() => {});
    return false;
  }
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
  setSelfDeaf(session, true);
}

function subscribeToUser(session: VoiceSession, guild: Guild, userId: string): void {
  if (!session.listening || session.subscriptions.has(userId)) return;

  const decoder = new OpusScript(SAMPLE_RATE, OPUS_CHANNELS, OpusScript.Application.AUDIO);
  const pcmFrames: Buffer[] = [];
  let totalFrames = 0;

  const stream = session.connection.receiver.subscribe(userId, {
    // Shorter silence window = the utterance is sent to STT sooner after the
    // speaker stops, so moderation/kick reacts faster. Too low would split
    // normal sentences mid-word; 500ms is a snappy-but-safe balance.
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
  // 'close' fires milliseconds after the utterance ends, long before STT and
  // the reply finish, so the renewed subscription still captures anything
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
    if (session.listening) subscribeToUser(session, guild, userId);
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
    // Cleanup and renewal belong to 'close' — this function only processes
    // whatever audio the stream captured.
    if (!session.listening || totalFrames === 0) return;
    const raw = Buffer.concat(pcmFrames);

    // stereo → mono downmix
    const monoLen = raw.length >> 1;
    const mono = Buffer.alloc(monoLen);
    for (let i = 0; i < monoLen; i += 2) {
      const l = raw.readInt16LE(i << 1);
      const r = raw.readInt16LE((i << 1) + 2);
      mono.writeInt16LE(Math.max(-32768, Math.min(32767, (l + r) >> 1)), i);
    }
    // normalize quiet audio to ~80% peak
    let peak = 0;
    for (let i = 0; i < monoLen; i += 2) {
      const s = Math.abs(mono.readInt16LE(i));
      if (s > peak) peak = s;
    }
    if (peak > 0 && peak < 20000) {
      const gain = 26214 / peak;
      for (let i = 0; i < monoLen; i += 2) {
        mono.writeInt16LE(
          Math.max(-32768, Math.min(32767, Math.round(mono.readInt16LE(i) * gain))), i,
        );
      }
    }

    try {
      await addListenSeconds(guild.id, totalFrames * FRAME_SECONDS);
      const config = await getCachedGuildConfig(guild.id);
      if (await isListenQuotaExceeded(guild.id)) {
        stopListening(session);
        await playSpeech(guild.id, t(config.language).listenQuotaExhausted).catch(() => {});
        return;
      }
      const flows = await getCachedCommandFlows(guild.id).catch((): GuildCommandFlows | null => null);
      const text = await transcribe(
        pcmToWav(mono, SAMPLE_RATE, 1),
        sttHint(config.voice.wake_word, flows),
        config.language,
      );
      console.log(`[Voice ${guild.id}] STT="${text}"`);

      const { handleTranscriptModeration } = await import('../protection/voice-mod.js');
      // moderated → skip wake-word handling (the 'close' renewal keeps
      // listening; a subscription to a kicked member is inert).
      if (await handleTranscriptModeration(guild, session, userId, text)) return;

      const query = parseWakeWord(text, config.voice.wake_word);
      console.log(`[Voice ${guild.id}] wake="${config.voice.wake_word}" ${query === null ? 'NO-MATCH' : `query="${query}"`}`);
      if (query !== null) {
        const { routeVoiceCommand } = await import('./router.js');
        const answer = await routeVoiceCommand(guild, session, query, userId);
        if (answer) {
          // Best-effort spoken reply (needs TTS/ElevenLabs)...
          await playSpeech(guild.id, answer).catch((e) => console.error('[Listen] speak:', e));
          // ...and always a text reply so the answer is visible without TTS.
          const { resolveModerationChannel } = await import('../protection/voice-mod.js');
          await resolveModerationChannel(guild, config.protection.log_channel_id)
            ?.send(`🤖 ${answer}`.slice(0, 2000))
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[Listen ${guild.id}]`, err);
    }
  }
}
