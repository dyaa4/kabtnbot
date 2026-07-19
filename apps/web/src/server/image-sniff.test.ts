import { describe, it, expect } from 'vitest';
import { sniffImageType, imageDimensions, imageTooLarge } from '@gamebot/shared';
import { pngHeader, gifHeader, jpegHeader, webpVp8xHeader } from './testing/image-fixtures.js';

describe('imageDimensions', () => {
  it('parses PNG, GIF, JPEG and WebP (VP8X) headers', () => {
    expect(imageDimensions(pngHeader(1234, 567))).toEqual({ width: 1234, height: 567 });
    expect(imageDimensions(gifHeader(320, 200))).toEqual({ width: 320, height: 200 });
    expect(imageDimensions(jpegHeader(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(imageDimensions(webpVp8xHeader(800, 450))).toEqual({ width: 800, height: 450 });
  });

  it('returns null for unparseable bytes', () => {
    expect(imageDimensions(Buffer.from('definitely not an image'))).toBeNull();
    expect(imageDimensions(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // truncated PNG
  });

  it('flags decompression bombs via imageTooLarge', () => {
    expect(imageTooLarge({ width: 20000, height: 20000 })).toBe(true);
    expect(imageTooLarge({ width: 9000, height: 10 })).toBe(true); // single side too long
    expect(imageTooLarge({ width: 7000, height: 7000 })).toBe(true); // 49 MP total
    expect(imageTooLarge({ width: 3840, height: 2160 })).toBe(false);
  });

  it('sniffs types from magic bytes', () => {
    expect(sniffImageType(pngHeader(1, 1))).toBe('image/png');
    expect(sniffImageType(gifHeader(1, 1))).toBe('image/gif');
    expect(sniffImageType(jpegHeader(1, 1))).toBe('image/jpeg');
    expect(sniffImageType(webpVp8xHeader(1, 1))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('hello'))).toBeNull();
  });
});
