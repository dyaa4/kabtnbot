import OpusScript from 'opusscript';
import { EndBehaviorType } from '@discordjs/voice';
import type { Guild, VoiceState } from 'discord.js';
import { parseWakeWord } from '@gamebot/shared';
import { getGuildConfig } from '@gamebot/db';
import { transcribe } from './stt.js';
import { pcmToWav } from './wav.js';
import { addListenSeconds, isListenQuotaExceeded } from '../../lib/quotas.js';
import { playSpeech, type VoiceSession, getSession } from './sessions.js';
import { S } from '../../lib/strings.js';

const SAMPLE_RATE = 48000;
const OPUS_CHANNELS = 2;
const FRAME_SECONDS = 0.02; // one Opus frame ≈ 20 ms

export async function startListening(session: VoiceSession, guild: Guild): Promise<void> {
  if (session.listening) return;
  if (await isListenQuotaExceeded(guild.id)) {
    await playSpeech(guild.id, S.listenQuotaExhausted).catch(() => {});
    return;
  }
  session.listening = true;

  const members = guild.members.cache.filter(
    (m) => m.voice.channelId === session.channelId && !m.user.bot,
  );
  for (const [id] of members) subscribeToUser(session, guild, id);

  const onVoiceState = (_old: VoiceState, next: VoiceState) => {
    const live = getSession(guild.id);
    if (!live?.listening || next.channelId !== live.channelId || next.member?.user.bot) return;
    subscribeToUser(live, guild, next.id);
  };
  guild.client.on('voiceStateUpdate', onVoiceState);
  session.removeVoiceHandler = () => guild.client.removeListener('voiceStateUpdate', onVoiceState);
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
}

function subscribeToUser(session: VoiceSession, guild: Guild, userId: string): void {
  if (!session.listening || session.subscriptions.has(userId)) return;

  const decoder = new OpusScript(SAMPLE_RATE, OPUS_CHANNELS, OpusScript.Application.AUDIO);
  const pcmFrames: Buffer[] = [];
  let totalFrames = 0;

  const stream = session.connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 800 },
  });
  session.subscriptions.set(userId, { decoder, stream });

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
  stream.on('error', () => {
    session.subscriptions.delete(userId);
    decoder.delete();
    if (session.listening) subscribeToUser(session, guild, userId);
  });

  async function onUtteranceEnd(): Promise<void> {
    session.subscriptions.delete(userId);
    if (!session.listening || totalFrames === 0) { decoder.delete(); return; }

    const raw = Buffer.concat(pcmFrames);
    decoder.delete();

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
      if (await isListenQuotaExceeded(guild.id)) {
        stopListening(session);
        await playSpeech(guild.id, S.listenQuotaExhausted).catch(() => {});
        return;
      }

      const config = await getGuildConfig(guild.id);
      const text = await transcribe(pcmToWav(mono, SAMPLE_RATE, 1), config.voice.wake_word);
      const query = parseWakeWord(text, config.voice.wake_word);
      if (query !== null) {
        const { routeVoiceCommand } = await import('./router.js');
        const answer = await routeVoiceCommand(guild, session, query);
        if (answer) await playSpeech(guild.id, answer).catch((e) => console.error('[Listen] speak:', e));
      }
    } catch (err) {
      console.error(`[Listen ${guild.id}]`, err);
    }

    if (session.listening) subscribeToUser(session, guild, userId);
  }
}
