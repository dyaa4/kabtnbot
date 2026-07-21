import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Minimal Opus decoder surface we use. `delete` frees WASM state (opusscript);
 * the native encoder is GC-managed, so it's optional.
 */
export interface OpusDecoder {
  decode(buffer: Buffer): Buffer;
  delete?(): void;
}

type Factory = (rate: number, channels: number) => OpusDecoder;

/**
 * Prefer the NATIVE Opus decoder (@discordjs/opus) and fall back to the pure-WASM
 * one (opusscript). @discordjs/opus is an OPTIONAL dependency: on Linux/Railway
 * its prebuilt binary loads and gives a stable, fast decoder; where that binary
 * is missing (e.g. a Windows dev box with no build tools) `require` throws and
 * we transparently use opusscript. The WASM decoder works everywhere but can
 * crash under churn ("memory access out of bounds"), which is exactly why the
 * native path is preferred when available.
 */
function pick(): { make: Factory; name: string } {
  try {
    const { OpusEncoder } = require('@discordjs/opus') as {
      OpusEncoder: new (rate: number, channels: number) => OpusDecoder;
    };
    return { make: (rate, channels) => new OpusEncoder(rate, channels), name: 'native @discordjs/opus' };
  } catch {
    const OpusScript = require('opusscript') as {
      new (rate: number, channels: number, app: number): OpusDecoder;
      Application: { AUDIO: number };
    };
    return {
      make: (rate, channels) => new OpusScript(rate, channels, OpusScript.Application.AUDIO),
      name: 'WASM opusscript (native unavailable)',
    };
  }
}

const picked = pick();
console.log(`[Opus] decoder: ${picked.name}`);

export function createOpusDecoder(rate: number, channels: number): OpusDecoder {
  return picked.make(rate, channels);
}
