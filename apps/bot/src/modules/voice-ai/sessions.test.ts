import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const voice = vi.hoisted(() => {
  const AudioPlayerStatus = { Idle: 'idle', Playing: 'playing', AutoPaused: 'autopaused' } as const;
  const VoiceConnectionStatus = {
    Ready: 'ready', Disconnected: 'disconnected', Signalling: 'signalling', Connecting: 'connecting',
  } as const;
  return {
    AudioPlayerStatus,
    VoiceConnectionStatus,
    player: null as unknown as { play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } & EventEmitter,
    // Resolvers for the pending entersState(player, Idle, …) call, so a test
    // decides exactly when "playback finished" happens.
    pending: [] as Array<{ timeout: number; resolve: () => void; reject: (e: Error) => void }>,
  };
});

vi.mock('@discordjs/voice', () => ({
  AudioPlayerStatus: voice.AudioPlayerStatus,
  VoiceConnectionStatus: voice.VoiceConnectionStatus,
  StreamType: { Raw: 'raw' },
  joinVoiceChannel: () => Object.assign(new EventEmitter(), {
    state: { status: 'ready' }, subscribe: vi.fn(), destroy: vi.fn(),
  }),
  createAudioPlayer: () => voice.player,
  createAudioResource: (stream: unknown, opts: unknown) => ({ stream, opts }),
  getVoiceConnection: () => undefined,
  entersState: (target: unknown, status: string, timeout: number) => {
    // The connect path awaits Ready; only the playback wait is under test.
    if (status !== voice.AudioPlayerStatus.Idle) return Promise.resolve(target);
    return new Promise<void>((resolve, reject) => voice.pending.push({ timeout, resolve, reject }));
  },
}));

const synth = vi.hoisted(() => ({ bytes: 48_000 * 2 * 2 })); // 1s of 48k s16le stereo
vi.mock('./elevenlabs-tts.js', () => ({
  synthesizeVoice: vi.fn(async () => Buffer.alloc(synth.bytes)),
  elevenLabsReady: () => true,
}));
vi.mock('./tts.js', () => ({ synthesizeSpeech: vi.fn(async () => Buffer.alloc(synth.bytes)) }));
vi.mock('./realtime.js', () => ({ closeRealtime: vi.fn() }));
vi.mock('./answer-session.js', () => ({ closeAnswerSession: vi.fn() }));
vi.mock('../../config.js', () => ({ voiceEngineGroq: true }));
vi.mock('../../lib/config-cache.js', () => ({
  getCachedGuildConfig: async () => ({
    language: 'ar',
    voice: { dialect: 'gulf', tts_voice: 'x' },
  }),
}));

import { joinGuildVoice, playSpeech, stopPlayback, leaveGuildVoice, spokenText } from './sessions.js';
import { synthesizeVoice } from './elevenlabs-tts.js';

function fakeChannel() {
  return {
    id: 'c1', guildId: 'g1',
    guild: { id: 'g1', voiceAdapterCreator: vi.fn() },
    client: { on: vi.fn(), removeListener: vi.fn(), user: { id: 'bot' } },
  } as never;
}

beforeEach(async () => {
  voice.pending = [];
  synth.bytes = 48_000 * 2 * 2;
  voice.player = Object.assign(new EventEmitter(), { play: vi.fn(), stop: vi.fn() }) as never;
  vi.mocked(synthesizeVoice).mockClear();
  leaveGuildVoice('g1');
  await joinGuildVoice(fakeChannel());
});

describe('spokenText', () => {
  it('keeps Arabic, punctuation and digits intact', () => {
    expect(spokenText('يا كابتن، عندك 3 رسائل.')).toBe('يا كابتن، عندك 3 رسائل.');
  });
  it('removes emoji and collapses the gap they leave', () => {
    expect(spokenText('⏳ خلصت  الأسئلة 🎵')).toBe('خلصت الأسئلة');
  });
  it('empties a line that was only decoration', () => {
    expect(spokenText('🔊 🎧')).toBe('');
  });

  // Length is a cost lever: the model can ignore "two sentences" and 1024
  // tokens of Arabic would be synthesized in full.
  it('caps an over-long line at 600 characters', () => {
    expect(spokenText('ا'.repeat(5000)).length).toBe(600);
  });

  it('cuts back to a word boundary instead of mid-word', () => {
    const out = spokenText(`${'كلمة '.repeat(200)}نهاية`);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith('كلمة')).toBe(true);
  });

  it('leaves a line just under the cap untouched', () => {
    const line = 'ا'.repeat(600);
    expect(spokenText(line)).toBe(line);
  });
});

describe('playSpeech', () => {
  it('does not resolve until playback actually finishes', async () => {
    let settled = false;
    const p = playSpeech('g1', 'مرحبا').then(() => { settled = true; });

    // Let synthesis + player.play() run; the promise must still be open, or the
    // caller would end the turn while the bot is mid-sentence.
    await vi.waitFor(() => expect(voice.pending).toHaveLength(1));
    expect(voice.player.play).toHaveBeenCalled();
    expect(settled).toBe(false);

    voice.pending[0].resolve();
    await p;
    expect(settled).toBe(true);
  });

  it('waits at least the audio duration plus slack', async () => {
    synth.bytes = 48_000 * 2 * 2 * 3; // 3 seconds of audio
    const p = playSpeech('g1', 'مرحبا');
    await vi.waitFor(() => expect(voice.pending).toHaveLength(1));
    expect(voice.pending[0].timeout).toBe(3_000 + 5_000);
    voice.pending[0].resolve();
    await p;
  });

  it('resolves (never throws) when the player never reaches Idle', async () => {
    const p = playSpeech('g1', 'مرحبا');
    await vi.waitFor(() => expect(voice.pending).toHaveLength(1));
    voice.pending[0].reject(new Error('timeout'));
    await expect(p).resolves.toBeUndefined();
  });

  it('strips emoji before synthesis — the canned quota lines carry a ⏳', async () => {
    const p = playSpeech('g1', '⏳ خلصت أسئلة الذكاء الاصطناعي.');
    await vi.waitFor(() => expect(voice.pending).toHaveLength(1));
    expect(synthesizeVoice).toHaveBeenCalledWith('خلصت أسئلة الذكاء الاصطناعي.', 'ar', 'gulf');
    voice.pending[0].resolve();
    await p;
  });

  it('synthesizes nothing when only emoji are left', async () => {
    await playSpeech('g1', '🔊🎵');
    expect(synthesizeVoice).not.toHaveBeenCalled();
    expect(voice.player.play).not.toHaveBeenCalled();
  });

  it('resolves when stopPlayback cuts the answer (barge-in ends the turn)', async () => {
    const p = playSpeech('g1', 'مرحبا');
    await vi.waitFor(() => expect(voice.pending).toHaveLength(1));
    stopPlayback('g1');
    expect(voice.player.stop).toHaveBeenCalledWith(true);
    voice.pending[0].resolve(); // stop() drives the player to Idle
    await expect(p).resolves.toBeUndefined();
  });
});
