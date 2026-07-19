import WebSocket from 'ws';
import type { Guild } from 'discord.js';
import type { GuildCommandFlows } from '@gamebot/shared';
import { config } from '../../config.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { getCachedCommandFlows } from '../../lib/flows-cache.js';
import { buildSystemPrompt } from './prompts.js';
import { upsample24to48Stereo } from './audio-util.js';
import { OPENAI_VOICES } from './tts.js';

// One realtime session per guild replaces the old STT→LLM→TTS chain. The
// session runs with turn detection DISABLED: the server never answers on its
// own. Every utterance is committed (moderation needs every transcript), but a
// response is only requested after the wake word matched — that, plus deleting
// unaddressed items from the conversation, keeps audio-token cost bounded.

const IDLE_CLOSE_MS = 5 * 60_000; // no committed audio for 5 min → close WS (cost guard)
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const APPEND_CHUNK_BYTES = 48_000; // 1s of 24k mono pcm16 per append event
const MIN_UTTERANCE_BYTES = 4_800; // commit rejects <100ms of audio
const MAX_QUEUED_UTTERANCES = 5; // utterances buffered while the WS (re)connects

/**
 * Whisper biases decoding toward its prompt, so seed it with the EXACT words
 * it must recognize: the wake word plus the guild's enabled voice trigger
 * phrases. Only the gpt-4o-*-transcribe family accepts a prompt.
 */
export function sttHint(wakeWord: string, flows: GuildCommandFlows | null): string {
  const phrases = (flows?.flows ?? [])
    .filter((f) => f.enabled && f.sources.voice)
    .flatMap((f) => f.triggers)
    .slice(0, 12);
  return [wakeWord, ...phrases].join('، ').slice(0, 300);
}

export interface RealtimeCallbacks {
  /** Fires for EVERY transcribed utterance — moderation depends on this. */
  onTranscript(userId: string, itemId: string, text: string): void;
  /** Text of a spoken answer (mirrored to the log channel). */
  onAnswerText(text: string): void;
  /** Playback sink for answer audio (48k s16le stereo); null drops the audio. */
  openAudioSink(): NodeJS.WritableStream | null;
}

interface ServerEvent {
  type: string;
  item_id?: string;
  transcript?: string;
  delta?: string;
  error?: { type?: string; code?: string; message?: string };
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private closed = false; // deliberate close — suppresses reconnect
  private backoffMs = BACKOFF_MIN_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  // Commits are serialized on one WS, so `input_audio_buffer.committed` events
  // arrive in commit order — a FIFO of userIds maps each committed item to its
  // speaker even when transcription results later arrive out of order.
  private pendingSpeakers: string[] = [];
  private itemSpeakers = new Map<string, string>();
  private queuedUtterances: Array<{ pcm: Buffer; userId: string }> = [];

  private activeResponse = false;
  private audioSink: NodeJS.WritableStream | null = null;

  callbacks: RealtimeCallbacks | null = null;

  constructor(private readonly guildId: string, private readonly guildName: string) {}

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
        console.log(`[Realtime ${this.guildId}] connected`);
        this.sendSessionUpdate()
          .then(() => {
            const queued = this.queuedUtterances.splice(0);
            for (const u of queued) this.sendUtterance(u.pcm, u.userId);
            resolve();
          })
          .catch(reject);
      });
      ws.on('message', (data) => this.onMessage(data.toString()));
      ws.on('error', (err) => {
        console.error(`[Realtime ${this.guildId}] ws error:`, err.message);
      });
      ws.on('close', (code) => {
        clearTimeout(timeout);
        this.connecting = null;
        if (this.ws === ws) this.ws = null;
        this.resetTurnState();
        reject(new Error('REALTIME_CONNECT_FAILED'));
        if (!this.closed) {
          console.log(`[Realtime ${this.guildId}] closed (${code}); reconnecting in ${this.backoffMs}ms`);
          this.scheduleReconnect();
        }
      });
    });
    // The promise settles once per connection attempt; late rejections after a
    // successful resolve are no-ops, and callers of connect() always get a
    // handled promise.
    this.connecting.catch(() => {});
    return this.connecting;
  }

  /**
   * Ship one finished utterance (24kHz s16le mono). Append chunks + commit are
   * sent synchronously in ONE event-loop tick: the input buffer is shared per
   * session, so interleaving two speakers' appends would corrupt both.
   */
  sendUtterance(pcm24kMono: Buffer, userId: string): void {
    if (pcm24kMono.length < MIN_UTTERANCE_BYTES) return;
    this.touchIdle();
    if (this.ws?.readyState !== WebSocket.OPEN) {
      // Buffer through (re)connects so the first words after an idle-close
      // still reach moderation.
      if (this.queuedUtterances.length < MAX_QUEUED_UTTERANCES) {
        this.queuedUtterances.push({ pcm: pcm24kMono, userId });
      }
      this.connect().catch(() => {});
      return;
    }
    for (let off = 0; off < pcm24kMono.length; off += APPEND_CHUNK_BYTES) {
      this.send({
        type: 'input_audio_buffer.append',
        audio: pcm24kMono.subarray(off, off + APPEND_CHUNK_BYTES).toString('base64'),
      });
    }
    this.send({ type: 'input_audio_buffer.commit' });
    this.pendingSpeakers.push(userId);
  }

  /** Ask the model to answer the conversation so far. False = busy/offline. */
  requestResponse(): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    if (this.activeResponse) {
      console.log(`[Realtime ${this.guildId}] response already active — dropping request`);
      return false;
    }
    this.activeResponse = true;
    this.touchIdle();
    this.send({ type: 'response.create' });
    return true;
  }

  /** True while answer audio is being generated/streamed. */
  isResponding(): boolean {
    return this.activeResponse;
  }

  /** Drop an unaddressed/moderated utterance from the model's context. */
  deleteItem(itemId: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.send({ type: 'conversation.item.delete', item_id: itemId });
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.reconnectTimer = null;
    this.idleTimer = null;
    this.resetTurnState();
    this.queuedUtterances = [];
    try { this.ws?.close(); } catch { /* already closing */ }
    this.ws = null;
  }

  private onMessage(raw: string): void {
    let ev: ServerEvent;
    try { ev = JSON.parse(raw) as ServerEvent; } catch { return; }

    switch (ev.type) {
      case 'input_audio_buffer.committed': {
        const userId = this.pendingSpeakers.shift();
        if (userId && ev.item_id) this.itemSpeakers.set(ev.item_id, userId);
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        if (!ev.item_id) break;
        const userId = this.itemSpeakers.get(ev.item_id);
        this.itemSpeakers.delete(ev.item_id);
        if (userId) this.callbacks?.onTranscript(userId, ev.item_id, ev.transcript ?? '');
        break;
      }
      case 'conversation.item.input_audio_transcription.failed': {
        if (ev.item_id) this.itemSpeakers.delete(ev.item_id);
        console.error(`[Realtime ${this.guildId}] transcription failed:`, ev.error?.message);
        break;
      }
      case 'response.output_audio.delta': {
        if (!ev.delta) break;
        if (!this.audioSink) this.audioSink = this.callbacks?.openAudioSink() ?? null;
        this.audioSink?.write(upsample24to48Stereo(Buffer.from(ev.delta, 'base64')));
        break;
      }
      case 'response.output_audio_transcript.done': {
        if (ev.transcript) this.callbacks?.onAnswerText(ev.transcript);
        break;
      }
      case 'response.done': {
        this.audioSink?.end();
        this.audioSink = null;
        this.activeResponse = false;
        break;
      }
      case 'error': {
        console.error(`[Realtime ${this.guildId}] server error:`, ev.error?.code, ev.error?.message);
        break;
      }
    }
  }

  /** Rebuild + resend the session config (reconnect or guild-config change). */
  async sendSessionUpdate(): Promise<void> {
    const cfg = await getCachedGuildConfig(this.guildId);
    const flows = await getCachedCommandFlows(this.guildId).catch((): GuildCommandFlows | null => null);
    const promptSupported = config.OPENAI_TRANSCRIBE_MODEL.startsWith('gpt-4o-');
    const voice = OPENAI_VOICES.has(cfg.voice.tts_voice)
      ? cfg.voice.tts_voice
      : config.OPENAI_REALTIME_VOICE;
    const instructions = [
      buildSystemPrompt(this.guildName, {
        comedic: cfg.voice.personality_enabled,
        language: cfg.language,
      }),
      `You hear multiple speakers from a Discord voice channel. They address you with the wake word "${cfg.voice.wake_word}" — never repeat or mention the wake word in your answers.`,
      'You can only answer with speech. You cannot play music or songs, and you cannot perform any action on the server yourself — never claim or promise to do such things.',
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
            turn_detection: null, // manual mode: the server NEVER auto-responds
            transcription: {
              model: config.OPENAI_TRANSCRIBE_MODEL,
              language: cfg.language,
              ...(promptSupported ? { prompt: sttHint(cfg.voice.wake_word, flows) } : {}),
            },
          },
          output: { format: { type: 'audio/pcm', rate: 24000 }, voice },
        },
      },
    });
  }

  private send(payload: object): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private resetTurnState(): void {
    this.pendingSpeakers = [];
    this.itemSpeakers.clear();
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
      console.log(`[Realtime ${this.guildId}] idle — closing ws (lazy reconnect on next utterance)`);
      // Not a deliberate close of the CLIENT: keep it registered so the next
      // utterance reconnects, but suppress the backoff-reconnect loop.
      this.closed = true;
      try { this.ws?.close(); } catch { /* already closing */ }
      this.ws = null;
      this.resetTurnState();
    }, IDLE_CLOSE_MS);
  }
}

const clients = new Map<string, RealtimeClient>();

export function getRealtime(guildId: string): RealtimeClient | undefined {
  return clients.get(guildId);
}

/** Lazily create + connect the guild's realtime session. Throws without an API key. */
export async function ensureRealtime(guildId: string, guild: Guild): Promise<RealtimeClient> {
  if (!config.OPENAI_API_KEY) throw new Error('REALTIME_NOT_CONFIGURED');
  let client = clients.get(guildId);
  if (!client) {
    client = new RealtimeClient(guildId, guild.name);
    clients.set(guildId, client);
  }
  await client.connect();
  return client;
}

export function closeRealtime(guildId: string): void {
  clients.get(guildId)?.close();
  clients.delete(guildId);
}
