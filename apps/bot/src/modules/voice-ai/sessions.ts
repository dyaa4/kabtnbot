import {
  joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, StreamType,
  type VoiceConnection, type AudioPlayer,
} from '@discordjs/voice';
import { Readable } from 'stream';
import type { VoiceBasedChannel } from 'discord.js';
import type OpusScript from 'opusscript';
import { synthesizeSpeech } from './tts.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';

export interface VoiceSession {
  guildId: string;
  channelId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  listening: boolean;
  subscriptions: Map<string, { decoder: OpusScript; stream: Readable }>;
  /** Detaches this session's client-level voiceStateUpdate listener (set by startListening). */
  removeVoiceHandler?: () => void;
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
      leaveGuildVoice(channel.guildId);
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
  sessions.set(channel.guildId, session);
  return session;
}

export function leaveGuildVoice(guildId: string): boolean {
  const session = sessions.get(guildId);
  sessions.delete(guildId);
  session?.removeVoiceHandler?.();
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
  const buffer = await synthesizeSpeech(text, config.voice.tts_voice);
  const resource = createAudioResource(Readable.from(buffer), { inputType: StreamType.Arbitrary });
  session.player.play(resource);
}
