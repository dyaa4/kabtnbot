import Groq from 'groq-sdk';
import { config } from '../../config.js';

const groq = config.GROQ_API_KEY ? new Groq({ apiKey: config.GROQ_API_KEY }) : null;

/**
 * Transcribe WAV audio via Groq Whisper. Returns '' on any failure.
 * `language` follows the guild's configured bot language (ar/en/de/tr/fr/ru — all
 * valid Whisper ISO-639-1 codes) so non-Arabic servers transcribe correctly
 * instead of being forced to Arabic. Failures are logged (not swallowed silently)
 * so a missing key / rate-limit / bad model surfaces in the bot logs.
 */
export async function transcribe(audioBuffer: Buffer, wakeWordHint: string, language: string): Promise<string> {
  if (!groq) {
    console.error('[STT] GROQ_API_KEY is not set — cannot transcribe');
    return '';
  }
  const makeFile = () => new File([audioBuffer as BlobPart], 'voice.wav', { type: 'audio/wav' });
  const base = { model: 'whisper-large-v3', language, response_format: 'json' } as const;
  try {
    const result = await groq.audio.transcriptions.create({
      ...base,
      file: makeFile(),
      // Prompt only with the wake word so commands still transcribe well. Do NOT seed
      // polite/greeting phrases here: Whisper biases decoding toward the prompt, and
      // greetings steer it away from emitting the profane words moderation must catch.
      prompt: wakeWordHint,
    });
    return result.text;
  } catch (e) {
    console.error('[STT] transcription failed, retrying without prompt:', (e as Error)?.message ?? e);
    try {
      const retry = await groq.audio.transcriptions.create({ ...base, file: makeFile() });
      return retry.text;
    } catch (e2) {
      console.error('[STT] transcription failed again — giving up:', (e2 as Error)?.message ?? e2);
      return '';
    }
  }
}
