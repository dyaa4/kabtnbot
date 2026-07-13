import { spawn } from 'child_process';
import { createRequire } from 'module';
import { config } from '../../config.js';
import { pcmToWav } from './wav.js';

const _require = createRequire(import.meta.url);

// Orpheus caps a single request at 200 characters; longer replies are split at
// word boundaries and their audio concatenated.
const GROQ_TTS_MAX_CHARS = 200;

function getFfmpeg(): string {
  try {
    return _require('ffmpeg-static') as string;
  } catch {
    return 'ffmpeg';
  }
}

function runFfmpeg(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpeg(), ['-i', 'pipe:0', '-af', 'volume=3.0', '-f', 'mp3', 'pipe:1', '-y'], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('FFMPEG_TIMEOUT')); }, 10_000);
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`FFMPEG_EXIT_${code}`));
    });
    proc.stdin.on('error', () => {}); // EPIPE if ffmpeg exits early
    proc.stdin.end(input);
  });
}

// Split into <=max-char chunks at word boundaries; hard-split any single word
// longer than the limit so we never exceed Orpheus's per-request cap.
export function chunkText(text: string, max: number): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (word.length > max) {
      if (cur) { chunks.push(cur); cur = ''; }
      for (let i = 0; i < word.length; i += max) chunks.push(word.slice(i, i + max));
      continue;
    }
    if (cur && cur.length + 1 + word.length > max) { chunks.push(cur); cur = word; }
    else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Extract PCM samples + format from a WAV buffer by walking its sub-chunks
// (the header size can vary, so we don't assume a fixed 44-byte offset).
export function wavPcm(buf: Buffer): { pcm: Buffer; sampleRate: number; channels: number } {
  let sampleRate = 24000;
  let channels = 1;
  let pcm: Buffer = Buffer.alloc(0);
  let offset = 12; // skip "RIFF"<size>"WAVE"
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
    } else if (id === 'data') {
      pcm = buf.subarray(body, body + size);
    }
    offset = body + size + (size & 1); // sub-chunks are word-aligned
  }
  return { pcm, sampleRate, channels };
}

async function synthesizeGroq(text: string, model: string, voice: string): Promise<Buffer> {
  const chunks = chunkText(text, GROQ_TTS_MAX_CHARS);
  const pcmParts: Buffer[] = [];
  let sampleRate = 24000;
  let channels = 1;
  for (const input of chunks) {
    const resp = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice, input, response_format: 'wav' }),
    });
    if (!resp.ok) throw new Error(`Groq TTS ${resp.status}: ${await resp.text().catch(() => '')}`);
    const parsed = wavPcm(Buffer.from(await resp.arrayBuffer()));
    sampleRate = parsed.sampleRate;
    channels = parsed.channels;
    pcmParts.push(parsed.pcm);
  }
  // Re-wrap the concatenated PCM as one WAV, then normalize/boost via ffmpeg.
  return runFfmpeg(pcmToWav(Buffer.concat(pcmParts), sampleRate, channels));
}

async function synthesizeElevenLabs(text: string): Promise<Buffer> {
  if (!config.ELEVENLABS_API_KEY) throw new Error('TTS_NOT_CONFIGURED');
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': config.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: config.ELEVENLABS_MODEL_ID,
      voice_settings: { stability: 0.3, similarity_boost: 0.5, style: 0.3 },
    }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
  return runFfmpeg(Buffer.from(await resp.arrayBuffer()));
}

// Picks the Groq TTS model + voice for a language. Arabic uses the per-guild
// Orpheus voice (lowercased ids like "fahad"); English uses the English Orpheus model.
function ttsParamsFor(language: string, voice?: string): { model: string; voice: string } | null {
  if (language === 'en') return { model: config.GROQ_TTS_MODEL_EN, voice: config.GROQ_TTS_VOICE_EN };
  if (language === 'ar') return { model: config.GROQ_TTS_MODEL, voice: (voice ?? config.GROQ_TTS_VOICE).toLowerCase() };
  return null;
}

/**
 * Text → spoken audio (mp3 buffer) in the guild's bot language. Groq covers STT
 * + chat + TTS from one key: Orpheus for Arabic and English. Other languages
 * are spoken via ElevenLabs (multilingual) when its key is configured;
 * otherwise TTS_UNSUPPORTED_LANGUAGE is thrown so callers fall back to
 * text-only. ElevenLabs also stays the fallback when Groq itself fails.
 */
export async function synthesizeSpeech(text: string, opts: { language: string; voice?: string }): Promise<Buffer> {
  const params = ttsParamsFor(opts.language, opts.voice);
  if (!params) {
    if (!config.ELEVENLABS_API_KEY) throw new Error('TTS_UNSUPPORTED_LANGUAGE');
    return synthesizeElevenLabs(text);
  }
  if (config.GROQ_API_KEY) {
    try {
      return await synthesizeGroq(text, params.model, params.voice);
    } catch (e) {
      console.error('[TTS] Groq failed:', (e as Error)?.message ?? e);
      if (!config.ELEVENLABS_API_KEY) throw e;
      console.error('[TTS] falling back to ElevenLabs');
    }
  }
  return synthesizeElevenLabs(text);
}
