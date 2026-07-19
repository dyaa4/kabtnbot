export type ImageContentType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

// Runtime-agnostic byte parsing (no Node Buffer): this file lives in the
// browser-safe shared package, so it operates on Uint8Array. Node Buffers are
// Uint8Arrays, so server callers pass them unchanged.
//
// A Uint8Array may be a view into a larger ArrayBuffer (Node pools Buffers!),
// so every DataView MUST honour byteOffset + byteLength — never assume the
// view starts at offset 0 of its backing buffer.
function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function ascii(buf: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(buf[start + i]);
  return s;
}

// Identify the actual image format from magic bytes instead of trusting the
// Content-Type header of the upload.
export function sniffImageType(buf: Uint8Array): ImageContentType | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 6 && ascii(buf, 0, 4) === 'GIF8') {
    return 'image/gif';
  }
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Read the pixel dimensions from the image header WITHOUT decoding the image.
 * Used to reject decompression bombs (a small file that decodes to a huge
 * bitmap) before they are stored and later rendered by the bot.
 * Returns null when the header cannot be parsed.
 */
export function imageDimensions(buf: Uint8Array): ImageDimensions | null {
  const type = sniffImageType(buf);
  const dv = view(buf);
  if (type === 'image/png' && buf.length >= 24) {
    // IHDR is always the first chunk: width/height big-endian at offsets 16/20.
    return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
  }
  if (type === 'image/gif' && buf.length >= 10) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  if (type === 'image/jpeg') {
    return jpegDimensions(buf, dv);
  }
  if (type === 'image/webp') {
    return webpDimensions(buf, dv);
  }
  return null;
}

function jpegDimensions(buf: Uint8Array, dv: DataView): ImageDimensions | null {
  // Walk the marker segments until a start-of-frame marker (C0–CF except
  // C4/C8/CC) which carries height/width right after the precision byte.
  let off = 2;
  while (off + 9 <= buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      off += 2;
      continue;
    }
    const len = dv.getUint16(off + 2, false);
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (off + 9 > buf.length) return null;
      return { height: dv.getUint16(off + 5, false), width: dv.getUint16(off + 7, false) };
    }
    off += 2 + len;
  }
  return null;
}

function webpDimensions(buf: Uint8Array, dv: DataView): ImageDimensions | null {
  if (buf.length < 30) return null;
  const chunk = ascii(buf, 12, 4);
  if (chunk === 'VP8X') {
    // 24-bit little-endian (width-1)/(height-1) at offsets 24/27.
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  if (chunk === 'VP8 ') {
    // Lossy bitstream: 3-byte frame tag, 3-byte start code 9D 01 2A, then 14-bit dims.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) return null;
    const bits = dv.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

// 8K on a side / 32 MP total decodes to ≤128 MB RGBA — safe for the bot renderer.
export const MAX_IMAGE_SIDE = 8000;
export const MAX_IMAGE_PIXELS = 32_000_000;

export function imageTooLarge(dim: ImageDimensions): boolean {
  return dim.width > MAX_IMAGE_SIDE || dim.height > MAX_IMAGE_SIDE || dim.width * dim.height > MAX_IMAGE_PIXELS;
}
