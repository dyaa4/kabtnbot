import type { Dialect } from '@gamebot/shared';
import { config, dialectVoiceId } from '../../config.js';
import { upsample24to48Stereo } from './audio-util.js';

/** Core POST: text + voice id → 48kHz s16le stereo (Discord StreamType.Raw).
 * Requested as raw 24kHz PCM (`pcm_24000`) so it feeds the same upsample step
 * as the OpenAI path — no ffmpeg. Throws ELEVENLABS_NOT_CONFIGURED without a
 * key. */
export async function synthesizeElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  if (!config.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_NOT_CONFIGURED');
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
 * The ElevenLabs voice id for a guild: Arabic → the dialect's voice id, falling
 * back to the default; every other language → the default. '' when nothing is
 * configured (caller can't speak → text/log only).
 */
export function resolveVoiceId(language: string, dialect: Dialect): string {
  if (language === 'ar') return dialectVoiceId(dialect) || config.ELEVENLABS_VOICE_DEFAULT;
  return config.ELEVENLABS_VOICE_DEFAULT;
}

/**
 * Speak text for a guild in its language/dialect via ElevenLabs. Throws
 * ELEVENLABS_VOICE_NOT_CONFIGURED when no voice id resolves (no default set).
 */
export async function synthesizeVoice(text: string, language: string, dialect: Dialect): Promise<Buffer> {
  const voiceId = resolveVoiceId(language, dialect);
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_NOT_CONFIGURED');
  return synthesizeElevenLabs(text, voiceId);
}

/** Whether ElevenLabs can speak for this guild at all (key + a resolvable id). */
export function elevenLabsReady(language: string, dialect: Dialect): boolean {
  return !!config.ELEVENLABS_API_KEY && !!resolveVoiceId(language, dialect);
}

// ── OpenAI-engine path only (answer-session text mode) ─────────────────────

/** Synthesize with the Arabic dialect voice; throws if the dialect has no id.
 * Used by the OpenAI-brain answer session (VOICE_ENGINE=openai). */
export async function synthesizeDialectSpeech(text: string, dialect: Dialect): Promise<Buffer> {
  const voiceId = dialectVoiceId(dialect);
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_NOT_CONFIGURED');
  return synthesizeElevenLabs(text, voiceId);
}

/**
 * Whether the OpenAI answer session should emit text for ElevenLabs instead of
 * native audio: Arabic + a key + a dialect voice id. Groq engine doesn't use
 * this — it always speaks via ElevenLabs.
 */
export function useDialectVoice(language: string, dialect: Dialect): boolean {
  return language === 'ar' && !!config.ELEVENLABS_API_KEY && !!dialectVoiceId(dialect);
}
