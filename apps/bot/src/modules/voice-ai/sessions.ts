import {
  joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, StreamType,
  type VoiceConnection, type AudioPlayer,
} from '@discordjs/voice';
import { PassThrough, Readable } from 'stream';
import type { VoiceBasedChannel, VoiceState } from 'discord.js';
import type OpusScript from 'opusscript';
import { synthesizeSpeech } from './tts.js';
import { closeRealtime } from './realtime.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';

export interface VoiceSession {
  guildId: string;
  channelId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  listening: boolean;
  subscriptions: Map<string, { decoder: OpusScript; stream: Readable }>;
  /** Open conversation window: this speaker may follow up without the wake word until `until` (ms epoch). */
  followUp?: { userId: string; until: number };
  /** Detaches this session's client-level voiceStateUpdate listener (set by startListening). */
  removeVoiceHandler?: () => void;
  /** Detaches the listener that tracks the bot being dragged to another channel. */
  removeBotMoveHandler?: () => void;
}

const sessions = new Map<string, VoiceSession>();

export function getSession(guildId: string): VoiceSession | undefined {
  return sessions.get(guildId);
}

export async function joinGuildVoice(channel: VoiceBasedChannel): Promise<VoiceSession> {
  leaveGuildVoice(channel.guildId); // clean slate on rejoin

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  // Diagnostic: log every state transition so a failed connect tells us WHICH
  // layer stalled. Stuck at `signalling` => gateway never delivered the voice
  // server (intent/adapter). Stuck at `connecting` => UDP handshake / IP
  // discovery never completed (host network, e.g. Railway blocking UDP).
  let lastStatus: string = connection.state.status;
  connection.on('stateChange', (oldState, newState) => {
    lastStatus = newState.status;
    console.log(`[Voice ${channel.guildId}] state ${oldState.status} -> ${newState.status}`);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch {
    console.error(`[Voice ${channel.guildId}] connect timed out; last status: ${lastStatus}`);
    connection.destroy();
    throw new Error('VOICE_CONNECT_FAILED');
  }

  const player = createAudioPlayer();
  connection.subscribe(player);
  const resubscribe = () => {
    const s = sessions.get(channel.guildId);
    if (s) s.connection.subscribe(s.player);
  };
  player.on(AudioPlayerStatus.AutoPaused, resubscribe);
  player.on('error', (err) => console.error(`[Voice ${channel.guildId}] player:`, err));

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      // Only tear down if THIS connection still owns the guild's session. A
      // rejoin during the 5s reconnect race may have already replaced it with a
      // live one — tearing that down would silently kill the user's fresh join.
      if (sessions.get(channel.guildId)?.connection === connection) leaveGuildVoice(channel.guildId);
    }
  });
  connection.on('error', (err) => console.error(`[Voice ${channel.guildId}] conn:`, err));

  const session: VoiceSession = {
    guildId: channel.guildId,
    channelId: channel.id,
    connection,
    player,
    listening: false,
    subscriptions: new Map(),
  };

  // Keep channelId in sync when an admin drags the bot to another channel —
  // otherwise new speakers there are never subscribed, kick targets resolve
  // against the old channel, and the deafen-rejoin would teleport the bot back.
  const onBotMove = (_old: VoiceState, next: VoiceState) => {
    if (next.guild.id !== channel.guildId || next.id !== channel.client.user?.id) return;
    const live = sessions.get(channel.guildId);
    if (live && next.channelId) live.channelId = next.channelId;
  };
  channel.client.on('voiceStateUpdate', onBotMove);
  session.removeBotMoveHandler = () => channel.client.removeListener('voiceStateUpdate', onBotMove);

  sessions.set(channel.guildId, session);
  return session;
}

export function leaveGuildVoice(guildId: string): boolean {
  closeRealtime(guildId);
  const session = sessions.get(guildId);
  sessions.delete(guildId);
  // The flag must drop BEFORE the connection dies: an in-flight utterance
  // handler checks it after STT returns and would otherwise re-subscribe on
  // the destroyed connection, leaking a decoder per voice-leave.
  if (session) session.listening = false;
  session?.removeVoiceHandler?.();
  session?.removeBotMoveHandler?.();
  for (const { decoder, stream } of session?.subscriptions.values() ?? []) {
    stream.destroy();
    decoder.delete();
  }
  const connection = session?.connection ?? getVoiceConnection(guildId);
  if (!connection) return false;
  try { connection.destroy(); } catch { /* already destroyed */ }
  return true;
}

export async function playSpeech(guildId: string, text: string): Promise<void> {
  const session = sessions.get(guildId);
  if (!session) throw new Error('NOT_CONNECTED');
  const config = await getCachedGuildConfig(guildId);
  // synthesizeSpeech returns 48kHz s16le stereo — exactly StreamType.Raw.
  const buffer = await synthesizeSpeech(text, { language: config.language, voice: config.voice.tts_voice });
  const resource = createAudioResource(Readable.from(buffer), { inputType: StreamType.Raw });
  session.player.play(resource);
}

/**
 * Live playback sink for realtime answer audio: the returned stream accepts
 * 48kHz s16le stereo chunks and plays as they arrive, so the reply starts
 * before the model has finished speaking.
 */
export function playPcmStream(guildId: string): PassThrough | null {
  const session = sessions.get(guildId);
  if (!session) return null;
  const stream = new PassThrough();
  session.player.play(createAudioResource(stream, { inputType: StreamType.Raw }));
  return stream;
}
