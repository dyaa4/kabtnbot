import { spawn } from 'child_process';
import { createRequire } from 'module';
import { config } from '../../config.js';

const _require = createRequire(import.meta.url);

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

export async function synthesizeSpeech(text: string): Promise<Buffer> {
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
  const raw = Buffer.from(await resp.arrayBuffer());
  return runFfmpeg(raw);
}
