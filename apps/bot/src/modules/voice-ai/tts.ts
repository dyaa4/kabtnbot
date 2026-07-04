import { execSync } from 'child_process';
import { createRequire } from 'module';
import { config } from '../../config.js';

const _require = createRequire(import.meta.url);

function getFfmpeg(): string {
  try {
    return _require.resolve('ffmpeg-static').replace(/[\\/]index\.js$/, '') + '/ffmpeg';
  } catch {
    return 'ffmpeg';
  }
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
  return execSync(`"${getFfmpeg()}" -i pipe:0 -af "volume=3.0" -f mp3 pipe:1 -y`, {
    input: raw, timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'buffer',
  });
}
