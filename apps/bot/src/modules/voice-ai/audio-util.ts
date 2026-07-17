// Pure s16le PCM helpers shared by the voice pipeline. Discord delivers/expects
// 48kHz interleaved stereo; the OpenAI Realtime + TTS APIs speak 24kHz mono.

const clamp16 = (v: number): number => Math.max(-32768, Math.min(32767, v));

/** 48kHz interleaved stereo → 48kHz mono (average of both channels). */
export function downmixStereoToMono(stereo: Buffer): Buffer {
  const monoLen = stereo.length >> 1;
  const mono = Buffer.alloc(monoLen);
  for (let i = 0; i < monoLen; i += 2) {
    const l = stereo.readInt16LE(i << 1);
    const r = stereo.readInt16LE((i << 1) + 2);
    mono.writeInt16LE(clamp16((l + r) >> 1), i);
  }
  return mono;
}

/**
 * Boost quiet captures in place to ~80% peak so far-from-mic speakers stay
 * intelligible for transcription. Audio already near full scale is untouched
 * (gain would only clip it).
 */
export function normalizeQuietAudio(mono: Buffer): void {
  const len = mono.length & ~1;
  let peak = 0;
  for (let i = 0; i < len; i += 2) {
    const s = Math.abs(mono.readInt16LE(i));
    if (s > peak) peak = s;
  }
  if (peak === 0 || peak >= 20000) return;
  const gain = 26214 / peak;
  for (let i = 0; i < len; i += 2) {
    mono.writeInt16LE(clamp16(Math.round(mono.readInt16LE(i) * gain)), i);
  }
}

/** 48kHz mono → 24kHz mono by averaging adjacent sample pairs. */
export function downsample48to24(mono48: Buffer): Buffer {
  const outSamples = mono48.length >> 2;
  const out = Buffer.alloc(outSamples << 1);
  for (let i = 0; i < outSamples; i++) {
    const a = mono48.readInt16LE(i << 2);
    const b = mono48.readInt16LE((i << 2) + 2);
    out.writeInt16LE(clamp16((a + b) >> 1), i << 1);
  }
  return out;
}

/**
 * 24kHz mono → 48kHz interleaved stereo (Discord StreamType.Raw format):
 * 2x linear interpolation, each sample duplicated into both channels.
 */
export function upsample24to48Stereo(mono24: Buffer): Buffer {
  const inSamples = mono24.length >> 1;
  const out = Buffer.alloc(inSamples << 3); // 2x rate * 2 channels * 2 bytes
  for (let i = 0; i < inSamples; i++) {
    const cur = mono24.readInt16LE(i << 1);
    const next = i + 1 < inSamples ? mono24.readInt16LE((i + 1) << 1) : cur;
    const mid = (cur + next) >> 1;
    const o = i << 3;
    out.writeInt16LE(cur, o);
    out.writeInt16LE(cur, o + 2);
    out.writeInt16LE(mid, o + 4);
    out.writeInt16LE(mid, o + 6);
  }
  return out;
}
