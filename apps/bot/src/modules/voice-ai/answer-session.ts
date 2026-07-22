import WebSocket from 'ws';
import type { Guild } from 'discord.js';
import { config } from '../../config.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { buildSystemPrompt } from './prompts.js';
import { silencePcm, upsample24to48Stereo } from './audio-util.js';
import { OPENAI_VOICES } from './tts.js';

// The V2 answer session: ONE speech-to-speech Realtime WS per guild that serves
// ONLY the currently active user. Server-side VAD drives turn-taking (low
// latency + natural barge-in). Because it never receives another speaker's
// audio, context cannot mix and an answer cannot be cut off by others — by
// design. No FIFO attribution, no per-item delete bookkeeping: on handover we
// just wipe the conversation and re-point at the new user.

const IDLE_CLOSE_MS = 5 * 60_000; // no audio for 5 min → close WS (lazy reconnect)
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const APPEND_CHUNK_BYTES = 48_000; // 1s of 24k mono pcm16
const SILENCE_TAIL_MS = 250; // synthetic end-of-turn cue after a seeded replay

export interface AnswerCallbacks {
  /** Playback sink for answer audio (48k s16le stereo); null drops the audio. */
  openAudioSink(): NodeJS.WritableStream | null;
  /** Text of a spoken answer (mirrored to the log channel). */
  onAnswerText(text: string): void;
  /** An answer fully finished — arms the conversation idle timeout. */
  onResponseDone(): void;
  /** The active user started talking over the bot (barge-in) — stop playback. */
  onSpeechStarted(): void;
}

interface ServerEvent {
  type: string;
  transcript?: string;
  delta?: string;
  item?: { id?: string };
  error?: { code?: string; message?: string };
}

export class AnswerSession {
  private ws: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private closed = false;
  private backoffMs = BACKOFF_MIN_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  private _activeUser: string | null = null;
  private activeName = 'a member';
  private convoItems = new Set<string>(); // for clearContext on handover
  private activeResponse = false;
  private audioSink: NodeJS.WritableStream | null = null;

  callbacks: AnswerCallbacks | null = null;

  constructor(private readonly guildId: string, private readonly guildName: string) {}

  get activeUser(): string | null {
    return this._activeUser;
  }
  isResponding(): boolean {
    return this.activeResponse;
  }

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.closed = false;

    this.connecting = new Promise<void>((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.OPENAI_REALTIME_MODEL)}`;
      const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` } });
      this.ws = ws;
      const timeout = setTimeout(() => { ws.terminate(); }, 15_000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.connecting = null;
        this.backoffMs = BACKOFF_MIN_MS;
        console.log(`[Answer ${this.guildId}] connected`);
        this.sendSessionUpdate().then(resolve).catch(reject);
      });
      ws.on('message', (data) => this.onMessage(data.toString()));
      ws.on('error', (err) => console.error(`[Answer ${this.guildId}] ws error:`, err.message));
      ws.on('close', (code) => {
        clearTimeout(timeout);
        this.connecting = null;
        if (this.ws === ws) this.ws = null;
        this.resetResponseState();
        reject(new Error('ANSWER_CONNECT_FAILED'));
        if (!this.closed) {
          console.log(`[Answer ${this.guildId}] closed (${code}); reconnecting in ${this.backoffMs}ms`);
          this.scheduleReconnect();
        }
      });
    });
    this.connecting.catch(() => {});
    return this.connecting;
  }

  /** Rebuild the session config: server-VAD input, per-guild voice, instructions
   * naming the CURRENT active speaker. */
  async sendSessionUpdate(): Promise<void> {
    const cfg = await getCachedGuildConfig(this.guildId);
    const voice = OPENAI_VOICES.has(cfg.voice.tts_voice) ? cfg.voice.tts_voice : config.OPENAI_REALTIME_VOICE;
    const instructions = [
      buildSystemPrompt(this.guildName, { comedic: cfg.voice.personality_enabled, language: cfg.language }),
      `You are talking with ${this.activeName}. Address them by name naturally when it fits — never announce, list, or read out who is present.`,
      `They may address you with the wake word "${cfg.voice.wake_word}" — never repeat or mention the wake word in your answers.`,
      'You can only answer with speech. You cannot play music or perform any action on the server yourself — never claim or promise to.',
    ].join('\n');

    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions,
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            // Server VAD drives turn-taking: it auto-commits on speech-stop and
            // auto-creates the response, and interrupts the bot on barge-in.
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 200,
              create_response: true,
              interrupt_response: true,
            },
            transcription: null, // the firehose owns transcription — don't double-pay
          },
          output: { format: { type: 'audio/pcm', rate: 24000 }, voice },
        },
      },
    });
  }

  /**
   * Point the session at a new active user (or null when idle). Wipes the
   * previous conversation (isolation), refreshes the instructions with the new
   * speaker's name, and — when a wake utterance's audio is handed in — replays
   * it + a silence tail so server VAD answers that first question.
   */
  setActiveUser(userId: string | null, displayName?: string, seedPcm24?: Buffer | null): void {
    this.abort();
    this.clearContext();
    this._activeUser = userId;
    this.activeName = displayName ?? 'a member';
    if (userId === null) return;
    // Refresh instructions (new speaker name) FIRST, then replay the wake
    // utterance so the model answers the first question with the right context.
    void this.sendSessionUpdate().then(() => {
      if (this._activeUser === userId && seedPcm24 && seedPcm24.length > 0) {
        this.pushAudio(seedPcm24);
        this.pushSilenceTail();
      }
    });
  }

  /** Stream one chunk of the active user's live audio (24k s16le mono). */
  pushAudio(pcm24kMono: Buffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN || pcm24kMono.length === 0) return;
    this.touchIdle();
    for (let off = 0; off < pcm24kMono.length; off += APPEND_CHUNK_BYTES) {
      this.send({
        type: 'input_audio_buffer.append',
        audio: pcm24kMono.subarray(off, off + APPEND_CHUNK_BYTES).toString('base64'),
      });
    }
  }

  /** Append silence so server VAD detects speech-stop and closes a seeded turn. */
  pushSilenceTail(ms: number = SILENCE_TAIL_MS): void {
    this.pushAudio(silencePcm(ms, 24000));
  }

  /** Cancel an in-flight answer and stop its audio (moderation/command veto, handover). */
  abort(): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.activeResponse) {
      this.send({ type: 'response.cancel' });
    }
    this.audioSink?.end();
    this.audioSink = null;
    this.activeResponse = false;
  }

  /** Wipe the whole conversation + any buffered input so the next user starts clean. */
  clearContext(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      for (const id of this.convoItems) this.send({ type: 'conversation.item.delete', item_id: id });
      this.send({ type: 'input_audio_buffer.clear' });
    }
    this.convoItems.clear();
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.reconnectTimer = null;
    this.idleTimer = null;
    this.resetResponseState();
    this._activeUser = null;
    this.convoItems.clear();
    try { this.ws?.close(); } catch { /* already closing */ }
    this.ws = null;
  }

  private onMessage(raw: string): void {
    let ev: ServerEvent;
    try { ev = JSON.parse(raw) as ServerEvent; } catch { return; }

    switch (ev.type) {
      case 'conversation.item.created':
        if (ev.item?.id) this.convoItems.add(ev.item.id);
        break;
      case 'input_audio_buffer.speech_started':
        // Barge-in: the active user talked over the bot. interrupt_response makes
        // the server cancel the answer; stop local playback immediately.
        this.audioSink?.end();
        this.audioSink = null;
        this.callbacks?.onSpeechStarted();
        break;
      case 'response.created':
        this.activeResponse = true;
        break;
      case 'response.output_audio.delta':
        if (!ev.delta) break;
        if (!this.audioSink) this.audioSink = this.callbacks?.openAudioSink() ?? null;
        this.audioSink?.write(upsample24to48Stereo(Buffer.from(ev.delta, 'base64')));
        break;
      case 'response.output_audio_transcript.done':
        if (ev.transcript) this.callbacks?.onAnswerText(ev.transcript);
        break;
      case 'response.done':
        this.audioSink?.end();
        this.audioSink = null;
        this.activeResponse = false;
        this.callbacks?.onResponseDone();
        break;
      case 'response.cancelled':
        this.audioSink?.end();
        this.audioSink = null;
        this.activeResponse = false;
        break;
      case 'error': {
        const code = ev.error?.code;
        const message = ev.error?.message ?? '';
        console.error(`[Answer ${this.guildId}] server error:`, code, message);
        // A wrong/inaccessible model closes the socket; reconnecting just hammers.
        if (code === 'model_not_found' || /does not exist or you do not have access/i.test(message)) {
          console.error(
            `[Answer ${this.guildId}] FATAL: model "${config.OPENAI_REALTIME_MODEL}" unavailable — not reconnecting.`,
          );
          this.closed = true;
          try { this.ws?.close(); } catch { /* already closing */ }
          break;
        }
        // A rejected response leaves activeResponse stuck — recover.
        this.audioSink?.end();
        this.audioSink = null;
        this.activeResponse = false;
        break;
      }
    }
  }

  private send(payload: object): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private resetResponseState(): void {
    this.activeResponse = false;
    this.audioSink?.end();
    this.audioSink = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.connect().catch(() => {});
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
  }

  private touchIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.closed) return;
      console.log(`[Answer ${this.guildId}] idle — closing ws (lazy reconnect on next use)`);
      this.closed = true;
      try { this.ws?.close(); } catch { /* already closing */ }
      this.ws = null;
      this.resetResponseState();
    }, IDLE_CLOSE_MS);
  }
}

const sessions = new Map<string, AnswerSession>();

export function getAnswerSession(guildId: string): AnswerSession | undefined {
  return sessions.get(guildId);
}

/** Lazily create + connect the guild's answer session. Throws without an API key. */
export async function ensureAnswerSession(guildId: string, guild: Guild): Promise<AnswerSession> {
  if (!config.OPENAI_API_KEY) throw new Error('REALTIME_NOT_CONFIGURED');
  let session = sessions.get(guildId);
  if (!session) {
    session = new AnswerSession(guildId, guild.name);
    sessions.set(guildId, session);
  }
  await session.connect();
  return session;
}

export function closeAnswerSession(guildId: string): void {
  sessions.get(guildId)?.close();
  sessions.delete(guildId);
}
