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
 * The EXACT words STT must recognize: the wake word plus the guild's enabled
 * voice trigger phrases. Whisper takes them as a decode prompt (see sttHint);
 * ElevenLabs Scribe takes the list itself as `keyterms` biasing.
 */
export function sttTerms(wakeWord: string, flows: GuildCommandFlows | null): string[] {
  const phrases = (flows?.flows ?? [])
    .filter((f) => f.enabled && f.sources.voice)
    .flatMap((f) => f.triggers)
    .slice(0, 12);
  return [wakeWord, ...phrases].map((t) => t.trim()).filter(Boolean);
}

/**
 * Whisper biases decoding toward its prompt, so seed it with the trigger terms.
 * Only the gpt-4o-*-transcribe family and Groq Whisper accept a prompt.
 */
export function sttHint(wakeWord: string, flows: GuildCommandFlows | null): string {
  return sttTerms(wakeWord, flows).join('، ').slice(0, 300);
}

export interface RealtimeCallbacks {
  /** Fires for EVERY transcribed utterance — moderation depends on this. */
  onTranscript(userId: string, itemId: string, text: string): void;
  /** Text of a spoken answer (mirrored to the log channel). */
  onAnswerText(text: string): void;
  /** Playback sink for answer audio (48k s16le stereo); null drops the audio. */
  openAudioSink(): NodeJS.WritableStream | null;
  /** Fires when an answer has fully finished — arms the conversation idle timeout. */
  onResponseDone?(): void;
}

interface ServerEvent {
  type: string;
  item_id?: string;
  transcript?: string;
  delta?: string;
  item?: { id?: string };
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
  // Every conversation item id (user utterance, assistant answer, system note)
  // currently in the model's context — so clearContext() can wipe the lot when
  // the active speaker changes, keeping one user's history out of the next's.
  private convoItems = new Set<string>();
  // Item deletes that arrived WHILE an answer was generating are held here and
  // flushed on response.done — deleting an item mid-response can abort the
  // server's answer (it cuts off and restarts).
  private pendingDeletes = new Set<string>();

  private activeResponse = false;
  // One (and only one) response.create held back while a response is active.
  // Requests during an answer collapse into a single follow-on response — the
  // asking utterances are already in the conversation, so one answer covers
  // them all without a second voice talking over the first.
  private pendingResponse = false;
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

  /**
   * Ask the model to answer the conversation so far. False = offline.
   * `contextNote` (who is currently speaking) is injected as a short SYSTEM item
   * first, so the model knows who it is talking with and can address them by
   * name. Best-effort — a rejected item is non-fatal (the error handler recovers
   * and the answer still generates).
   */
  requestResponse(contextNote?: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.touchIdle();
    if (contextNote) {
      this.send({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: contextNote }] },
      });
    }
    if (this.activeResponse) {
      console.log(`[Realtime ${this.guildId}] response active — queueing request`);
      this.pendingResponse = true;
      return true;
    }
    this.activeResponse = true;
    this.send({ type: 'response.create' });
    return true;
  }

  /** True while answer audio is being generated/streamed. */
  isResponding(): boolean {
    return this.activeResponse;
  }

  /** Drop an unaddressed/moderated utterance from the model's context. */
  deleteItem(itemId: string): void {
    this.convoItems.delete(itemId);
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // Never mutate the conversation mid-answer — defer until the answer settles.
    if (this.activeResponse) {
      this.pendingDeletes.add(itemId);
      return;
    }
    this.send({ type: 'conversation.item.delete', item_id: itemId });
  }

  /**
   * Wipe the whole conversation from the model's context — called when the
   * ACTIVE speaker changes so a new user never inherits the previous one's
   * history (context isolation). The active-user lock keeps only one person's
   * turns in context at a time; this clears them on handover.
   */
  clearContext(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      for (const id of this.convoItems) this.send({ type: 'conversation.item.delete', item_id: id });
    }
    this.convoItems.clear();
    this.pendingDeletes.clear();
    this.pendingSpeakers = [];
    this.itemSpeakers.clear();
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
      case 'conversation.item.created': {
        // Track EVERY item (user/assistant/system) so clearContext() can wipe
        // the whole conversation on an active-speaker change.
        if (ev.item?.id) this.convoItems.add(ev.item.id);
        break;
      }
      case 'input_audio_buffer.committed': {
        const userId = this.pendingSpeakers.shift();
        if (userId && ev.item_id) {
          this.itemSpeakers.set(ev.item_id, userId);
          this.convoItems.add(ev.item_id);
        }
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
        // Flush deletes that were held back during the answer.
        if (this.pendingDeletes.size > 0) {
          for (const id of this.pendingDeletes) this.send({ type: 'conversation.item.delete', item_id: id });
          this.pendingDeletes.clear();
        }
        if (this.pendingResponse) {
          this.pendingResponse = false;
          this.activeResponse = true;
          this.send({ type: 'response.create' });
        } else {
          // A fully settled answer (nothing queued behind it) arms the
          // conversation's idle timeout via the manager.
          this.callbacks?.onResponseDone?.();
        }
        break;
      }
      case 'error': {
        const code = ev.error?.code;
        const message = ev.error?.message ?? '';
        console.error(`[Realtime ${this.guildId}] server error:`, code, message);
        // A wrong/inaccessible model is NOT transient: the server closes the
        // socket, and a plain reconnect just re-opens (resetting the backoff),
        // hits the same error, and closes again — a 1s hammer loop that also
        // starves the event loop (slash commands time out → Unknown interaction).
        // Stop reconnecting until something explicitly re-opens the session.
        if (code === 'model_not_found' || /does not exist or you do not have access/i.test(message)) {
          console.error(
            `[Realtime ${this.guildId}] FATAL: model "${config.OPENAI_REALTIME_MODEL}" is unavailable — ` +
              'not reconnecting. Set OPENAI_REALTIME_MODEL to an accessible model (e.g. gpt-realtime-mini).',
          );
          this.closed = true;
          try { this.ws?.close(); } catch { /* already closing */ }
          break;
        }
        if (code === 'input_audio_buffer_commit_empty') {
          // A rejected commit never emits `committed`, so its queued speaker id
          // would never be shifted and every later transcript would be mapped to
          // the WRONG user (moderation then warns/kicks the wrong member). Drop
          // the head that will never commit to resync the FIFO.
          if (this.pendingSpeakers.length > 0) this.pendingSpeakers.shift();
        } else if (this.activeResponse) {
          // A rejected response.create never emits `response.done`, so
          // activeResponse would stay true forever and every later request would
          // silently queue instead of answering. Recover exactly like response.done.
          this.activeResponse = false;
          this.audioSink?.end();
          this.audioSink = null;
          if (this.pendingResponse) {
            this.pendingResponse = false;
            this.activeResponse = true;
            this.send({ type: 'response.create' });
          }
        }
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
      'Before each reply you are told who is currently speaking, so you know who you are talking with — address them by their name naturally when it fits (e.g. "Yes, Ali, ..."), without overusing it. NEVER announce, list, or read out who is present in the channel.',
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
    this.convoItems.clear();
    this.pendingDeletes.clear();
    this.activeResponse = false;
    this.pendingResponse = false;
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
