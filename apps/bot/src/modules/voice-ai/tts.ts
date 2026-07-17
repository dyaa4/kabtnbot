import { config } from '../../config.js';
import { upsample24to48Stereo } from './audio-util.js';

// OpenAI's TTS voice ids. Guild configs are validated against this list in
// @gamebot/shared, but a stale in-flight value (pre-migration Orpheus ids like
// "fahad") must not 400 the whole announcement — coerce to the env default.
export const OPENAI_VOICES = new Set([
  'marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse',
]);

/**
 * Text → spoken audio as 48kHz s16le interleaved stereo (Discord
 * StreamType.Raw), via OpenAI TTS. The model is multilingual, so every guild
 * language works from one endpoint — the language itself is carried by the
 * text. Throws TTS_NOT_CONFIGURED without an API key so callers fall back to
 * text-only, matching the old behavior.
 */
export async function synthesizeSpeech(text: string, opts: { language: string; voice?: string }): Promise<Buffer> {
  if (!config.OPENAI_API_KEY) throw new Error('TTS_NOT_CONFIGURED');
  const voice = opts.voice && OPENAI_VOICES.has(opts.voice) ? opts.voice : config.OPENAI_REALTIME_VOICE;
  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.OPENAI_TTS_MODEL,
      voice,
      input: text,
      response_format: 'pcm', // s16le, 24kHz, mono
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI TTS ${resp.status}: ${await resp.text().catch(() => '')}`);
  return upsample24to48Stereo(Buffer.from(await resp.arrayBuffer()));
}
