import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const FakeWS = vi.hoisted(() => {
  class FakeWS {
    static OPEN = 1;
    static instances: FakeWS[] = [];
    readyState = 0;
    sent: Array<Record<string, unknown>> = [];
    private listeners = new Map<string, Array<(...a: unknown[]) => void>>();
    constructor(public url: string, public opts: Record<string, unknown>) { FakeWS.instances.push(this); }
    on(e: string, fn: (...a: unknown[]) => void): this {
      (this.listeners.get(e) ?? this.listeners.set(e, []).get(e)!).push(fn);
      return this;
    }
    private emit(e: string, ...a: unknown[]): void { for (const fn of this.listeners.get(e) ?? []) fn(...a); }
    send(data: string): void { this.sent.push(JSON.parse(data)); }
    close(): void { this.readyState = 3; this.emit('close', 1000); }
    terminate(): void { this.close(); }
    open(): void { this.readyState = 1; this.emit('open'); }
    message(obj: Record<string, unknown>): void { this.emit('message', JSON.stringify(obj)); }
  }
  return FakeWS;
});
vi.mock('ws', () => ({ default: FakeWS }));

const mockConfig = vi.hoisted(() => ({
  OPENAI_API_KEY: 'ok', OPENAI_REALTIME_MODEL: 'gpt-realtime-mini', OPENAI_REALTIME_VOICE: 'marin',
}));
vi.mock('../../config.js', () => ({ config: mockConfig }));
const guildCfg = vi.hoisted(() => ({
  value: { language: 'ar', voice: { wake_word: 'يا كابتن', tts_voice: 'cedar', personality_enabled: false, dialect: 'gulf' } },
}));
vi.mock('../../lib/config-cache.js', () => ({
  getCachedGuildConfig: vi.fn(async () => guildCfg.value),
}));

// Mocked whole: useDialectVoice defaults OFF so the existing audio-mode tests
// are unaffected; dialect tests flip it on and drive synthesizeDialectSpeech.
const elevenlabs = vi.hoisted(() => ({
  useDialectVoice: vi.fn(() => false),
  synthesizeDialectSpeech: vi.fn(async () => Buffer.from([1, 2, 3, 4])),
}));
vi.mock('./elevenlabs-tts.js', () => elevenlabs);

import { AnswerSession } from './answer-session.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function openSession(): Promise<{ s: AnswerSession; ws: InstanceType<typeof FakeWS> }> {
  const s = new AnswerSession('g1', 'Guild');
  const p = s.connect();
  const ws = FakeWS.instances.at(-1)!;
  ws.open();
  await p;
  return { s, ws };
}

const sessionUpdates = (ws: InstanceType<typeof FakeWS>) => ws.sent.filter((m) => m.type === 'session.update');

describe('AnswerSession', () => {
  it('configures server VAD + the active speaker name + per-guild voice', async () => {
    const { s, ws } = await openSession();
    s.setActiveUser('u1', 'Ali');
    await flush();
    const upd = sessionUpdates(ws).at(-1) as { session: { audio: { input: { turn_detection: Record<string, unknown>; transcription: unknown }; output: { voice: string } }; instructions: string } };
    expect(upd.session.audio.input.turn_detection.type).toBe('server_vad');
    expect(upd.session.audio.input.turn_detection.create_response).toBe(true);
    expect(upd.session.audio.input.turn_detection.interrupt_response).toBe(true);
    expect(upd.session.audio.input.transcription).toBeNull();
    expect(upd.session.audio.output.voice).toBe('cedar');
    expect(upd.session.instructions).toContain('Ali');
  });

  it('setActiveUser wipes the previous conversation and replays the seeded wake utterance', async () => {
    const { s, ws } = await openSession();
    ws.message({ type: 'conversation.item.created', item: { id: 'old-1' } });
    s.setActiveUser('u2', 'Sara', Buffer.alloc(4800)); // 100ms seed
    await flush();
    expect(ws.sent.some((m) => m.type === 'conversation.item.delete' && m.item_id === 'old-1')).toBe(true);
    expect(ws.sent.some((m) => m.type === 'input_audio_buffer.clear')).toBe(true);
    // seed audio + silence tail appended after the session.update
    expect(ws.sent.filter((m) => m.type === 'input_audio_buffer.append').length).toBeGreaterThan(0);
  });

  it('pushAudio appends only while a WS is open', async () => {
    const { s, ws } = await openSession();
    s.setActiveUser('u1', 'Ali');
    await flush();
    const before = ws.sent.filter((m) => m.type === 'input_audio_buffer.append').length;
    s.pushAudio(Buffer.alloc(2400));
    expect(ws.sent.filter((m) => m.type === 'input_audio_buffer.append').length).toBe(before + 1);
  });

  it('abort cancels an in-flight response', async () => {
    const { s, ws } = await openSession();
    ws.message({ type: 'response.created' });
    expect(s.isResponding()).toBe(true);
    s.abort();
    expect(ws.sent.at(-1)).toEqual({ type: 'response.cancel' });
    expect(s.isResponding()).toBe(false);
  });

  it('barge-in (speech_started) fires onSpeechStarted and stops playback', async () => {
    const { s, ws } = await openSession();
    let barged = false;
    s.callbacks = { openAudioSink: () => null, onAnswerText: () => {}, onResponseStart: () => {}, onResponseDone: () => {}, onSpeechStarted: () => { barged = true; } };
    ws.message({ type: 'response.created' });
    ws.message({ type: 'input_audio_buffer.speech_started' });
    expect(barged).toBe(true);
  });

  it('response.done arms the idle timeout via onResponseDone', async () => {
    const { s, ws } = await openSession();
    let done = false;
    s.callbacks = { openAudioSink: () => null, onAnswerText: () => {}, onResponseStart: () => {}, onResponseDone: () => { done = true; }, onSpeechStarted: () => {} };
    ws.message({ type: 'response.created' });
    ws.message({ type: 'response.done' });
    expect(done).toBe(true);
    expect(s.isResponding()).toBe(false);
  });

  it('configures audio output when dialect mode is off', async () => {
    elevenlabs.useDialectVoice.mockReturnValue(false);
    const { s, ws } = await openSession();
    s.setActiveUser('u1', 'Ali');
    await flush();
    const upd = sessionUpdates(ws).at(-1) as { session: { output_modalities: string[] } };
    expect(upd.session.output_modalities).toEqual(['audio']);
  });

  describe('dialect mode (ElevenLabs)', () => {
    beforeEach(() => elevenlabs.useDialectVoice.mockReturnValue(true));
    afterEach(() => {
      elevenlabs.useDialectVoice.mockReset();
      elevenlabs.useDialectVoice.mockReturnValue(false);
      elevenlabs.synthesizeDialectSpeech.mockReset();
      elevenlabs.synthesizeDialectSpeech.mockResolvedValue(Buffer.from([1, 2, 3, 4]));
    });

    const fakeSink = () => {
      const chunks: Buffer[] = [];
      let ended = false;
      return { chunks, write: (b: Buffer) => chunks.push(b), end: () => { ended = true; }, get ended() { return ended; } };
    };

    it('requests text output when dialect mode is on', async () => {
      const { s, ws } = await openSession();
      s.setActiveUser('u1', 'Ali');
      await flush();
      const upd = sessionUpdates(ws).at(-1) as { session: { output_modalities: string[] } };
      expect(upd.session.output_modalities).toEqual(['text']);
    });

    it('accumulates text deltas and synthesizes on response.done, writing to the sink', async () => {
      const { s, ws } = await openSession();
      const sink = fakeSink();
      const answers: string[] = [];
      let done = false;
      s.callbacks = { openAudioSink: () => sink, onAnswerText: (t) => answers.push(t), onResponseStart: () => {}, onResponseDone: () => { done = true; }, onSpeechStarted: () => {} };
      ws.message({ type: 'response.created' });
      ws.message({ type: 'response.output_text.delta', delta: 'مر' });
      ws.message({ type: 'response.output_text.delta', delta: 'حبا' });
      ws.message({ type: 'response.done' });
      await flush();
      expect(elevenlabs.synthesizeDialectSpeech).toHaveBeenCalledWith('مرحبا', 'gulf');
      expect(answers).toEqual(['مرحبا']);
      expect(sink.chunks.length).toBe(1);
      expect(sink.ended).toBe(true);
      expect(done).toBe(true);
      expect(s.isResponding()).toBe(false);
    });

    it('still fires onResponseDone when synthesis fails', async () => {
      elevenlabs.synthesizeDialectSpeech.mockRejectedValueOnce(new Error('ELEVENLABS_NOT_CONFIGURED'));
      const { s, ws } = await openSession();
      let done = false;
      s.callbacks = { openAudioSink: () => fakeSink(), onAnswerText: () => {}, onResponseStart: () => {}, onResponseDone: () => { done = true; }, onSpeechStarted: () => {} };
      ws.message({ type: 'response.created' });
      ws.message({ type: 'response.output_text.delta', delta: 'مرحبا' });
      ws.message({ type: 'response.done' });
      await flush();
      expect(done).toBe(true);
    });

    it('drops synthesized audio if the user barged in while ElevenLabs was working', async () => {
      let resolveSynth: (b: Buffer) => void = () => {};
      elevenlabs.synthesizeDialectSpeech.mockReturnValueOnce(new Promise<Buffer>((r) => { resolveSynth = r; }));
      const { s, ws } = await openSession();
      const sink = fakeSink();
      s.callbacks = { openAudioSink: () => sink, onAnswerText: () => {}, onResponseStart: () => {}, onResponseDone: () => {}, onSpeechStarted: () => {} };
      ws.message({ type: 'response.created' });
      ws.message({ type: 'response.output_text.delta', delta: 'مرحبا' });
      ws.message({ type: 'response.done' });
      // Barge-in lands BEFORE synthesis resolves → the audio must be dropped.
      ws.message({ type: 'input_audio_buffer.speech_started' });
      resolveSynth(Buffer.from([9, 9]));
      await flush();
      expect(sink.chunks.length).toBe(0);
    });
  });

  it('stops reconnecting on a fatal model_not_found error', async () => {
    vi.useFakeTimers();
    try {
      const { ws } = await openSession();
      const before = FakeWS.instances.length;
      ws.message({ type: 'error', error: { code: 'model_not_found', message: 'The model x does not exist or you do not have access to it.' } });
      vi.advanceTimersByTime(60_000);
      expect(FakeWS.instances.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
