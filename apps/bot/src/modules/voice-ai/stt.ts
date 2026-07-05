import Groq from 'groq-sdk';
import { config } from '../../config.js';

const groq = config.GROQ_API_KEY ? new Groq({ apiKey: config.GROQ_API_KEY }) : null;

/** Transcribe WAV audio via Groq Whisper. Returns '' on any failure. */
export async function transcribe(audioBuffer: Buffer, wakeWordHint: string): Promise<string> {
  if (!groq) return '';
  const makeFile = () => new File([audioBuffer as BlobPart], 'voice.wav', { type: 'audio/wav' });
  const base = { model: 'whisper-large-v3', language: 'ar', response_format: 'json' } as const;
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
  } catch {
    try {
      const retry = await groq.audio.transcriptions.create({ ...base, file: makeFile() });
      return retry.text;
    } catch {
      return '';
    }
  }
}
