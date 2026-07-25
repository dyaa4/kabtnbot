import type { GuildCommandFlows } from '@gamebot/shared';
import { config, voiceEngineGroq } from '../../config.js';
import { pcm16ToWav } from './audio-util.js';
import { sttHint } from './realtime.js';

export interface TranscribeOpts {
  language: string;
  wakeWord: string;
  flows: GuildCommandFlows | null;
}

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

/**
 * REST transcription of ONE gated utterance (24kHz s16le mono PCM) — the V2
 * firehose. Because it's one request per utterance the speaker is known per
 * call, so there is NO shared-session FIFO attribution (the source of the
 * wrong-user-kick bug). Returns '' on any failure — the caller treats empty as
 * "nothing to moderate or route".
 *
 * Provider follows VOICE_ENGINE: groq (default) → Groq Whisper (no OpenAI
 * dependency); openai → OpenAI transcription.
 */
export async function transcribeUtterance(pcm24kMono: Buffer, opts: TranscribeOpts): Promise<string> {
  const groq = voiceEngineGroq;
  const apiKey = groq ? config.GROQ_API_KEY : config.OPENAI_API_KEY;
  if (!apiKey) return '';
  const model = groq ? config.GROQ_STT_MODEL : config.OPENAI_TRANSCRIBE_MODEL;

  const form = new FormData();
  // new Uint8Array(...) gives a plain ArrayBuffer-backed view (Buffer's generic
  // backing isn't assignable to BlobPart under the current TS lib types).
  const wav = new Uint8Array(pcm16ToWav(pcm24kMono, 24000, 1));
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'utterance.wav');
  form.append('model', model);
  form.append('language', opts.language);
  // A decode prompt biases toward the wake word + trigger phrases. Groq Whisper
  // accepts it; on OpenAI only gpt-4o-*-transcribe does (whisper-* reject it).
  if (groq || model.startsWith('gpt-4o-')) {
    form.append('prompt', sttHint(opts.wakeWord, opts.flows));
  }
  try {
    const res = await fetch(groq ? GROQ_ENDPOINT : OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      // Surface the provider's error body — a bare status can't distinguish a
      // revoked key, missing model access, or an org restriction (all 403).
      const detail = await res.text().catch(() => '');
      console.error(`[Transcribe] HTTP ${res.status} ${(groq ? 'groq' : 'openai')} ${detail.slice(0, 300)}`);
      return '';
    }
    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim();
  } catch (err) {
    console.error('[Transcribe]', (err as Error)?.message ?? err);
    return '';
  }
}
