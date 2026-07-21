import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before module imports, so the fake ws brings its own tiny
// event emitter instead of importing node:events.
const FakeWS = vi.hoisted(() => {
  class FakeWS {
    static OPEN = 1;
    static instances: FakeWS[] = [];
    readyState = 0;
    sent: Array<Record<string, unknown>> = [];
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    constructor(public url: string, public opts: Record<string, unknown>) {
      FakeWS.instances.push(this);
    }
    on(event: string, fn: (...args: unknown[]) => void): this {
      const list = this.listeners.get(event) ?? [];
      list.push(fn);
      this.listeners.set(event, list);
      return this;
    }
    private emit(event: string, ...args: unknown[]): void {
      for (const fn of this.listeners.get(event) ?? []) fn(...args);
    }
    send(data: string): void { this.sent.push(JSON.parse(data)); }
    close(): void { this.readyState = 3; this.emit('close', 1000); }
    terminate(): void { this.close(); }
    // test helpers
    open(): void { this.readyState = 1; this.emit('open'); }
    message(obj: Record<string, unknown>): void { this.emit('message', JSON.stringify(obj)); }
  }
  return FakeWS;
});

vi.mock('ws', () => ({ default: FakeWS }));

const mockConfig = vi.hoisted(() => ({
  OPENAI_API_KEY: 'ok',
  OPENAI_REALTIME_MODEL: 'gpt-realtime-mini',
  OPENAI_REALTIME_VOICE: 'marin',
  OPENAI_TRANSCRIBE_MODEL: 'gpt-4o-mini-transcribe',
  OPENAI_TTS_MODEL: 'gpt-4o-mini-tts',
}));
vi.mock('../../config.js', () => ({ config: mockConfig }));

vi.mock('../../lib/config-cache.js', () => ({
  getCachedGuildConfig: vi.fn(async () => ({
    language: 'ar',
    voice: { wake_word: 'يا كابتن', tts_voice: 'cedar', personality_enabled: false },
  })),
}));
vi.mock('../../lib/flows-cache.js', () => ({
  getCachedCommandFlows: vi.fn(async () => ({
    flows: [
      { enabled: true, sources: { voice: true }, triggers: ['افتح روم'] },
      { enabled: false, sources: { voice: true }, triggers: ['مخفي'] },
    ],
    builtin_overrides: {},
  })),
}));

import { RealtimeClient, sttHint } from './realtime.js';

function pcm(bytes: number): Buffer {
  return Buffer.alloc(bytes);
}

async function openClient(): Promise<{ client: RealtimeClient; ws: InstanceType<typeof FakeWS> }> {
  const client = new RealtimeClient('g1', 'Guild');
  const p = client.connect();
  const ws = FakeWS.instances.at(-1)!;
  ws.open();
  await p;
  return { client, ws };
}

beforeEach(() => {
  FakeWS.instances.length = 0;
  mockConfig.OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
});

describe('sttHint', () => {
  it('joins wake word with enabled voice trigger phrases only', () => {
    const flows = {
      flows: [
        { enabled: true, sources: { voice: true }, triggers: ['افتح روم'] },
        { enabled: false, sources: { voice: true }, triggers: ['مخفي'] },
      ],
    } as never;
    expect(sttHint('يا كابتن', flows)).toBe('يا كابتن، افتح روم');
  });
});

describe('RealtimeClient session.update', () => {
  it('sends manual-mode session config with per-guild voice and stt prompt on open', async () => {
    const { ws } = await openClient();
    const update = ws.sent.find((m) => m.type === 'session.update') as never as {
      session: {
        type: string; output_modalities: string[];
        audio: {
          input: { turn_detection: unknown; transcription: { model: string; language: string; prompt?: string } };
          output: { voice: string };
        };
      };
    };
    expect(update).toBeDefined();
    expect(update.session.type).toBe('realtime');
    expect(update.session.output_modalities).toEqual(['audio']);
    expect(update.session.audio.input.turn_detection).toBeNull();
    expect(update.session.audio.input.transcription.model).toBe('gpt-4o-mini-transcribe');
    expect(update.session.audio.input.transcription.prompt).toContain('يا كابتن');
    expect(update.session.audio.output.voice).toBe('cedar');
  });

  it('omits the transcription prompt for models that do not support it', async () => {
    mockConfig.OPENAI_TRANSCRIBE_MODEL = 'gpt-realtime-whisper';
    const { ws } = await openClient();
    const update = ws.sent.find((m) => m.type === 'session.update') as never as {
      session: { audio: { input: { transcription: Record<string, unknown> } } };
    };
    expect('prompt' in update.session.audio.input.transcription).toBe(false);
  });
});

describe('sendUtterance', () => {
  it('appends chunks + commits atomically and attributes the item to the speaker', async () => {
    const { client, ws } = await openClient();
    const transcripts: Array<[string, string, string]> = [];
    client.callbacks = {
      onTranscript: (u, i, t) => transcripts.push([u, i, t]),
      onAnswerText: () => {},
      openAudioSink: () => null,
    };

    client.sendUtterance(pcm(100_000), 'user-a');
    client.sendUtterance(pcm(10_000), 'user-b');
    const appends = ws.sent.filter((m) => m.type === 'input_audio_buffer.append');
    const commits = ws.sent.filter((m) => m.type === 'input_audio_buffer.commit');
    expect(appends.length).toBe(4); // 100k → 3 chunks à 48k, 10k → 1
    expect(commits.length).toBe(2);

    // committed events arrive in commit order; transcripts may arrive out of order
    ws.message({ type: 'input_audio_buffer.committed', item_id: 'item-1' });
    ws.message({ type: 'input_audio_buffer.committed', item_id: 'item-2' });
    ws.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-2', transcript: 'ثاني',
    });
    ws.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1', transcript: 'اول',
    });
    expect(transcripts).toEqual([
      ['user-b', 'item-2', 'ثاني'],
      ['user-a', 'item-1', 'اول'],
    ]);
  });

  it('drops utterances shorter than the 100ms commit minimum', async () => {
    const { client, ws } = await openClient();
    client.sendUtterance(pcm(1_000), 'user-a');
    expect(ws.sent.filter((m) => m.type === 'input_audio_buffer.commit').length).toBe(0);
  });

  it('queues utterances while disconnected and flushes them on reconnect', async () => {
    const { client, ws } = await openClient();
    ws.close(); // unexpected close → client reconnects with backoff
    client.sendUtterance(pcm(10_000), 'user-a'); // no live ws → queued + connect kick
    const ws2 = FakeWS.instances.at(-1)!;
    expect(ws2).not.toBe(ws);
    const p = client.connect();
    ws2.open();
    await p;
    expect(ws2.sent.filter((m) => m.type === 'input_audio_buffer.commit').length).toBe(1);
    client.close();
  });
});

describe('responses', () => {
  it('allows one active response at a time and streams audio to the sink', async () => {
    const { client, ws } = await openClient();
    const written: Buffer[] = [];
    let ended = false;
    const answers: string[] = [];
    client.callbacks = {
      onTranscript: () => {},
      onAnswerText: (t) => answers.push(t),
      openAudioSink: () => ({
        write: (b: Buffer) => { written.push(b); return true; },
        end: () => { ended = true; },
      }) as never,
    };

    expect(client.requestResponse()).toBe(true);

    ws.message({ type: 'response.output_audio.delta', delta: pcm(4).toString('base64') });
    expect(written.length).toBe(1);
    expect(written[0].length).toBe(16); // 2 samples → 2x rate * stereo

    ws.message({ type: 'response.output_audio_transcript.done', transcript: 'الجواب' });
    ws.message({ type: 'response.done' });
    expect(ended).toBe(true);
    expect(answers).toEqual(['الجواب']);
    expect(client.requestResponse()).toBe(true); // free again
  });

  it('injects the current-speaker context note as a system item BEFORE the response', async () => {
    const { client, ws } = await openClient();
    client.callbacks = { onTranscript: () => {}, onAnswerText: () => {}, openAudioSink: () => null };

    expect(client.requestResponse('You are now talking with Ali.')).toBe(true);

    const created = ws.sent.find((m) => m.type === 'conversation.item.create') as never as {
      item: { role: string; content: { type: string; text: string }[] };
    };
    expect(created).toBeDefined();
    expect(created.item.role).toBe('system');
    expect(created.item.content[0].text).toContain('Ali');
    // Must precede response.create so the model has its audience before answering.
    const idxItem = ws.sent.findIndex((m) => m.type === 'conversation.item.create');
    const idxResp = ws.sent.findIndex((m) => m.type === 'response.create');
    expect(idxItem).toBeLessThan(idxResp);
  });

  it('sends no context item when no note is given', async () => {
    const { client, ws } = await openClient();
    client.callbacks = { onTranscript: () => {}, onAnswerText: () => {}, openAudioSink: () => null };
    expect(client.requestResponse()).toBe(true);
    expect(ws.sent.some((m) => m.type === 'conversation.item.create')).toBe(false);
  });

  it('queues a request while a response is active and answers it after response.done', async () => {
    const { client, ws } = await openClient();
    client.callbacks = { onTranscript: () => {}, onAnswerText: () => {}, openAudioSink: () => null };

    expect(client.requestResponse()).toBe(true);
    expect(client.isResponding()).toBe(true);
    // A second question during the answer must neither be dropped (swallowed
    // question) nor spoken OVER the running answer (two voices) — it waits.
    expect(client.requestResponse()).toBe(true);
    expect(ws.sent.filter((m) => m.type === 'response.create').length).toBe(1);

    ws.message({ type: 'response.done' });
    expect(ws.sent.filter((m) => m.type === 'response.create').length).toBe(2);
    expect(client.isResponding()).toBe(true); // queued response now active

    ws.message({ type: 'response.done' });
    // queue drained — no third response, client idle again
    expect(ws.sent.filter((m) => m.type === 'response.create').length).toBe(2);
    expect(client.isResponding()).toBe(false);
  });
});

describe('error recovery', () => {
  it('recovers activeResponse on a response error so later requests are not queued forever', async () => {
    const { client, ws } = await openClient();
    client.callbacks = { onTranscript: () => {}, onAnswerText: () => {}, openAudioSink: () => null };
    expect(client.requestResponse()).toBe(true);
    expect(client.isResponding()).toBe(true);
    // Server rejects the response — no response.done will ever arrive.
    ws.message({ type: 'error', error: { code: 'response_error', message: 'boom' } });
    expect(client.isResponding()).toBe(false); // recovered, not deadlocked
    const before = ws.sent.filter((m) => m.type === 'response.create').length;
    expect(client.requestResponse()).toBe(true);
    expect(ws.sent.filter((m) => m.type === 'response.create').length).toBe(before + 1); // actually created
  });

  it('resyncs speaker attribution after a rejected (empty) commit', async () => {
    const { client, ws } = await openClient();
    const transcripts: Array<[string, string, string]> = [];
    client.callbacks = {
      onTranscript: (u, i, t) => transcripts.push([u, i, t]),
      onAnswerText: () => {},
      openAudioSink: () => null,
    };
    client.sendUtterance(pcm(10_000), 'user-a'); // commit 1 — server will reject as empty
    client.sendUtterance(pcm(10_000), 'user-b'); // commit 2
    ws.message({ type: 'error', error: { code: 'input_audio_buffer_commit_empty' } });
    // The next committed event must now map to user-b (head resynced), not user-a.
    ws.message({ type: 'input_audio_buffer.committed', item_id: 'item-2' });
    ws.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-2', transcript: 'ثاني',
    });
    expect(transcripts).toEqual([['user-b', 'item-2', 'ثاني']]);
  });

  it('stops reconnecting on a fatal model_not_found error (no 1s hammer loop)', async () => {
    vi.useFakeTimers();
    try {
      const { ws } = await openClient();
      const before = FakeWS.instances.length;
      ws.message({
        type: 'error',
        error: { code: 'model_not_found', message: 'The model `x` does not exist or you do not have access to it.' },
      });
      // The fatal handler closes the socket; advancing well past any backoff must
      // NOT spawn a reconnect (a transient close would have).
      vi.advanceTimersByTime(60_000);
      expect(FakeWS.instances.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('deleteItem', () => {
  it('sends conversation.item.delete', async () => {
    const { client, ws } = await openClient();
    client.deleteItem('item-9');
    expect(ws.sent.at(-1)).toEqual({ type: 'conversation.item.delete', item_id: 'item-9' });
  });
});
