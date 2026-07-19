import { isIP } from 'node:net';
import { imageDimensions, imageTooLarge, MAX_IMAGE_PIXELS } from '@gamebot/shared';

// Legacy welcome banners can be a remote https URL (uploaded assets are the
// modern, pre-validated path). Fetching an arbitrary URL and handing it to the
// canvas decoder is a decompression-bomb OOM AND a blind-SSRF vector, so this
// helper fetches defensively and validates BEFORE any decode:
//   • https only, and the host must not be a private/loopback/link-local IP;
//   • redirects are refused (a public URL must not hop to an internal one);
//   • the body is byte-capped while streaming (no multi-GB download);
//   • dimensions are read from the header and rejected if too large, so the
//     bomb never reaches loadImage.

const MAX_BYTES = 8 * 1024 * 1024; // matches the upload cap
const FETCH_TIMEOUT_MS = 5000;

/** True for hosts we must never fetch from the bot host (SSRF targets). */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost') || h === '' || h.endsWith('.internal')) return true;
  const kind = isIP(h);
  if (kind === 4) {
    const [a, b] = h.split('.').map(Number);
    return (
      a === 127 || // loopback
      a === 10 || // private
      a === 0 ||
      (a === 169 && b === 254) || // link-local (cloud metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    );
  }
  if (kind === 6) {
    return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  }
  // A DNS name could still resolve to a private IP; the redirect refusal +
  // byte cap + dimension check bound the damage. Hostnames are allowed.
  return false;
}

/**
 * Fetch a remote image safely and return its bytes, or throw. The caller
 * (renderWelcomeImage) falls back to a text-only welcome on throw.
 */
export async function fetchRemoteImage(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('invalid image URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('image URL must be https');
  if (isBlockedHost(parsed.hostname)) throw new Error('image host not allowed');

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: 'error', signal: ac.signal });
    // `redirect:'error'` throws on a redirect in most runtimes; guard the flag
    // too in case a runtime resolves instead of rejecting.
    if (res.redirected) throw new Error('image URL redirected');
    if (!res.ok || !res.body) throw new Error(`image fetch failed (${res.status})`);

    // Stream with a hard byte cap so a huge/unbounded body can't exhaust memory.
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('image too large');
      }
      chunks.push(Buffer.from(value));
    }
    const buf = Buffer.concat(chunks);

    // Reject decompression bombs from the HEADER, before any decode. A tiny
    // file can declare 30000x30000; imageTooLarge catches it here.
    const dim = imageDimensions(buf);
    if (!dim) throw new Error('unrecognized image format');
    if (imageTooLarge(dim)) throw new Error(`image dimensions too large (max ${MAX_IMAGE_PIXELS}px)`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}
