import type { GuildCommandFlows } from '@gamebot/shared';
import { config } from '../../config.js';
import { pcm16ToWav } from './audio-util.js';
import { sttHint } from './realtime.js';

export interface TranscribeOpts {
  language: string;
  wakeWord: string;
  flows: GuildCommandFlows | null;
}

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * REST transcription of ONE gated utterance (24kHz s16le mono PCM) — the V2
 * firehose. Because it's one request per utterance the speaker is known per
 * call, so there is NO shared-session FIFO attribution (the source of the
 * wrong-user-kick bug). Returns '' on any failure — the caller treats empty as
 * "nothing to moderate or route".
 */
export async function transcribeUtterance(pcm24kMono: Buffer, opts: TranscribeOpts): Promise<string> {
  if (!config.OPENAI_API_KEY) return '';
  const form = new FormData();
  // new Uint8Array(...) gives a plain ArrayBuffer-backed view (Buffer's generic
  // backing isn't assignable to BlobPart under the current TS lib types).
  const wav = new Uint8Array(pcm16ToWav(pcm24kMono, 24000, 1));
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'utterance.wav');
  form.append('model', config.OPENAI_TRANSCRIBE_MODEL);
  form.append('language', opts.language);
  // Only gpt-4o-*-transcribe accepts a decode prompt (biases decoding toward the
  // wake word + trigger phrases); whisper-* reject it.
  if (config.OPENAI_TRANSCRIBE_MODEL.startsWith('gpt-4o-')) {
    form.append('prompt', sttHint(opts.wakeWord, opts.flows));
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      console.error(`[Transcribe] HTTP ${res.status}`);
      return '';
    }
    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim();
  } catch (err) {
    console.error('[Transcribe]', (err as Error)?.message ?? err);
    return '';
  }
}
