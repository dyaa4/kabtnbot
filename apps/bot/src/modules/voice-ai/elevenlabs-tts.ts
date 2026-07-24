import type { Dialect } from '@gamebot/shared';
import { config, dialectVoiceId } from '../../config.js';
import { upsample24to48Stereo } from './audio-util.js';

/**
 * Text → spoken audio as 48kHz s16le interleaved stereo (Discord
 * StreamType.Raw), via ElevenLabs, using the voice id configured for the given
 * Arabic dialect. Requested as raw 24kHz PCM (`output_format=pcm_24000`) so it
 * feeds the same upsample step the OpenAI path uses — no ffmpeg.
 *
 * Throws ELEVENLABS_NOT_CONFIGURED without an API key, and
 * ELEVENLABS_VOICE_NOT_CONFIGURED when the dialect has no voice id — callers
 * treat both as "fall back to the OpenAI Realtime audio voice".
 */
export async function synthesizeDialectSpeech(text: string, dialect: Dialect): Promise<Buffer> {
  if (!config.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_NOT_CONFIGURED');
  const voiceId = dialectVoiceId(dialect);
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_NOT_CONFIGURED');

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': config.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/pcm',
    },
    body: JSON.stringify({ text, model_id: config.ELEVENLABS_MODEL }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs TTS ${resp.status}: ${await resp.text().catch(() => '')}`);
  return upsample24to48Stereo(Buffer.from(await resp.arrayBuffer()));
}

/**
 * Whether this guild's answers should speak via an ElevenLabs dialect voice:
 * Arabic language + an API key + a voice id configured for the chosen dialect.
 * When false the answer session stays on the native OpenAI Realtime audio.
 */
export function useDialectVoice(language: string, dialect: Dialect): boolean {
  return language === 'ar' && !!config.ELEVENLABS_API_KEY && !!dialectVoiceId(dialect);
}
