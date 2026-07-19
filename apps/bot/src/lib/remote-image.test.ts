import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRemoteImage } from './remote-image.js';

// A tiny valid 1x1 PNG (header carries 1x1 dimensions).
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
    '01f15c4890000000a49444154789c6300010000050001',
  'hex',
);
// A PNG header that DECLARES 30000x30000 in a tiny file (decompression bomb).
function bombHeader(): Buffer {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(0x89504e47, 0); // not the real signature layout, but sniff checks bytes
  b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47;
  b.writeUInt32BE(30000, 16);
  b.writeUInt32BE(30000, 20);
  return b;
}

function mockFetchOnce(body: Buffer, init: { status?: number; redirected?: boolean; url?: string } = {}) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(body));
      controller.close();
    },
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    redirected: init.redirected ?? false,
    url: init.url ?? 'https://cdn.example.com/x.png',
    body: stream,
    headers: new Headers({ 'content-length': String(body.length) }),
  } as unknown as Response)));
}

beforeEach(() => vi.unstubAllGlobals());

describe('fetchRemoteImage', () => {
  it('rejects non-https URLs (no SSRF via other schemes)', async () => {
    await expect(fetchRemoteImage('http://cdn.example.com/x.png')).rejects.toThrow();
    await expect(fetchRemoteImage('file:///etc/passwd')).rejects.toThrow();
  });

  it('rejects private / link-local / loopback hosts (SSRF guard)', async () => {
    for (const url of [
      'https://169.254.169.254/latest/meta-data',
      'https://127.0.0.1/x.png',
      'https://10.0.0.5/x.png',
      'https://192.168.1.1/x.png',
      'https://localhost/x.png',
    ]) {
      await expect(fetchRemoteImage(url)).rejects.toThrow();
    }
  });

  it('rejects a decompression bomb by header dimensions BEFORE decoding', async () => {
    mockFetchOnce(bombHeader());
    await expect(fetchRemoteImage('https://cdn.example.com/bomb.png')).rejects.toThrow(/dimension|large/i);
  });

  it('rejects a response that redirected (no hop to an internal host)', async () => {
    mockFetchOnce(PNG_1x1, { redirected: true, url: 'https://169.254.169.254/x' });
    await expect(fetchRemoteImage('https://cdn.example.com/x.png')).rejects.toThrow();
  });

  it('returns the bytes for a small valid image on a public host', async () => {
    mockFetchOnce(PNG_1x1);
    const buf = await fetchRemoteImage('https://cdn.example.com/ok.png');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(PNG_1x1.length);
  });
});
