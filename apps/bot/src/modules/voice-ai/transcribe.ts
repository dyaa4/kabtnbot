import type { GuildCommandFlows } from '@gamebot/shared';
import { config, sttProvider, type SttProvider } from '../../config.js';
import { pcm16ToWav } from './audio-util.js';
import { sttHint, sttTerms } from './realtime.js';

export interface TranscribeOpts {
  language: string;
  wakeWord: string;
  flows: GuildCommandFlows | null;
}

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const ELEVENLABS_ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';

const MIN_UTTERANCE_BYTES = 4_800; // 100ms @ 24k mono s16 — every provider rejects less
// ElevenLabs keyterm limits: ≤1000 terms, <50 chars, ≤5 words each.
const MAX_KEYTERM_CHARS = 49;
const MAX_KEYTERM_WORDS = 5;

/**
 * The provider that will actually be called, plus its key. A configured
 * provider with no key means silence, so ElevenLabs falls back to Groq when
 * only the Groq key is present — going deaf is worse than the wrong provider.
 */
function resolveProvider(): { provider: SttProvider; apiKey: string } | null {
  const keys: Record<SttProvider, string> = {
    elevenlabs: config.ELEVENLABS_API_KEY,
    groq: config.GROQ_API_KEY,
    openai: config.OPENAI_API_KEY,
  };
  if (keys[sttProvider]) return { provider: sttProvider, apiKey: keys[sttProvider] };
  if (sttProvider === 'elevenlabs' && keys.groq) return { provider: 'groq', apiKey: keys.groq };
  return null;
}

/** Terms that satisfy ElevenLabs' keyterm limits (over-long ones are dropped). */
function keyterms(opts: TranscribeOpts): string[] {
  return sttTerms(opts.wakeWord, opts.flows)
    .filter((t) => t.length <= MAX_KEYTERM_CHARS && t.split(/\s+/).length <= MAX_KEYTERM_WORDS)
    .slice(0, 1000);
}

/** Multipart body for the OpenAI-shaped transcription APIs (OpenAI + Groq). */
function whisperForm(file: Blob, model: string, opts: TranscribeOpts, groq: boolean): FormData {
  const form = new FormData();
  form.append('file', file, 'utterance.wav');
  form.append('model', model);
  form.append('language', opts.language);
  // A decode prompt biases toward the wake word + trigger phrases. Groq Whisper
  // accepts it; on OpenAI only gpt-4o-*-transcribe does (whisper-* reject it).
  if (groq || model.startsWith('gpt-4o-')) {
    form.append('prompt', sttHint(opts.wakeWord, opts.flows));
  }
  return form;
}

/** Multipart body for ElevenLabs Scribe. `terms` empty → no keyterm biasing. */
function scribeForm(file: Blob, opts: TranscribeOpts, terms: string[]): FormData {
  const form = new FormData();
  form.append('file', file, 'utterance.wav');
  form.append('model_id', config.ELEVENLABS_STT_MODEL);
  if (opts.language) form.append('language_code', opts.language);
  // Scribe tags "(laughter)" and friends by default — noise that would reach
  // both the profanity matcher and the wake-word parser as if it were speech.
  form.append('tag_audio_events', 'false');
  if (terms.length) form.append('keyterms', JSON.stringify(terms));
  return form;
}

/**
 * REST transcription of ONE gated utterance (24kHz s16le mono PCM) — the V2
 * firehose. Because it's one request per utterance the speaker is known per
 * call, so there is NO shared-session FIFO attribution (the source of the
 * wrong-user-kick bug). Returns '' on any failure — the caller treats empty as
 * "nothing to moderate or route".
 *
 * Provider follows VOICE_STT / VOICE_ENGINE (see config.sttProvider):
 * ElevenLabs Scribe by default, Groq Whisper or OpenAI on request.
 */
export async function transcribeUtterance(pcm24kMono: Buffer, opts: TranscribeOpts): Promise<string> {
  const resolved = resolveProvider();
  if (!resolved) return '';
  if (pcm24kMono.length < MIN_UTTERANCE_BYTES) return '';
  const { provider, apiKey } = resolved;

  // new Uint8Array(...) gives a plain ArrayBuffer-backed view (Buffer's generic
  // backing isn't assignable to BlobPart under the current TS lib types).
  const wav = new Uint8Array(pcm16ToWav(pcm24kMono, 24000, 1));
  const file = new Blob([wav], { type: 'audio/wav' });

  const eleven = provider === 'elevenlabs';
  const endpoint = eleven ? ELEVENLABS_ENDPOINT : provider === 'groq' ? GROQ_ENDPOINT : OPENAI_ENDPOINT;
  const headers: Record<string, string> = eleven
    ? { 'xi-api-key': apiKey }
    : { Authorization: `Bearer ${apiKey}` };
  const model = provider === 'groq' ? config.GROQ_STT_MODEL : config.OPENAI_TRANSCRIBE_MODEL;
  const terms = eleven ? keyterms(opts) : [];

  const post = (withTerms: boolean) => fetch(endpoint, {
    method: 'POST',
    headers,
    body: eleven
      ? scribeForm(file, opts, withTerms ? terms : [])
      : whisperForm(file, model, opts, provider === 'groq'),
  });

  try {
    let res = await post(true);
    // Keyterms are a bias, not a requirement: a rejected term list must not
    // cost us the transcript, so retry once without it.
    if (res.status === 422 && terms.length) {
      console.warn('[Transcribe] elevenlabs rejected keyterms — retrying without biasing');
      res = await post(false);
    }
    if (!res.ok) {
      // Surface the provider's error body — a bare status can't distinguish a
      // revoked key, missing model access, or an org restriction (all 403).
      const detail = await res.text().catch(() => '');
      console.error(`[Transcribe] HTTP ${res.status} ${provider} ${detail.slice(0, 300)}`);
      return '';
    }
    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim();
  } catch (err) {
    console.error('[Transcribe]', (err as Error)?.message ?? err);
    return '';
  }
}
