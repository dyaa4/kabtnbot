import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fetchRemoteImage } from './remote-image.js';

// @napi-rs/canvas ships no fonts and slim server images have none installed —
// without a bundled font, Arabic member names render as empty boxes. Cairo
// (SIL OFL, see apps/bot/assets/OFL.txt) is registered once at module load.
// Same relative depth from src/lib and dist/lib.
const FONT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/Cairo-Variable.ttf');
export const WELCOME_FONT_FAMILY = 'Cairo Kabtn';
if (existsSync(FONT_PATH)) {
  GlobalFonts.registerFromPath(FONT_PATH, WELCOME_FONT_FAMILY);
}

export function formatWelcome(template: string, vars: { user: string; server: string; count: number }): string {
  return template
    .replaceAll('{user}', vars.user)
    .replaceAll('{server}', vars.server)
    .replaceAll('{count}', String(vars.count));
}

export async function renderWelcomeImage(opts: {
  banner: Buffer | string; // uploaded image bytes, or a legacy https URL
  avatar: Buffer | string; // avatar bytes or CDN URL
  name: string | null;
  x: number;
  y: number;
  size: number;
}): Promise<Buffer> {
  // A remote banner URL (legacy — uploaded assets are the pre-validated path)
  // is fetched defensively and its dimensions verified from the header BEFORE
  // decode: handing a URL straight to loadImage is a decompression-bomb OOM
  // (kills the shared process for every guild) and a blind-SSRF vector. The
  // avatar URL is always a Discord CDN URL built server-side, so it keeps the
  // cheap https guard. The caller catches and falls back to a text-only welcome.
  const bannerSrc = typeof opts.banner === 'string' ? await fetchRemoteImage(opts.banner) : opts.banner;
  if (typeof opts.avatar === 'string' && !opts.avatar.startsWith('https://')) {
    throw new Error('avatar URL must be https');
  }
  const banner = await loadImage(bannerSrc);
  const W = banner.width;
  const H = banner.height;
  // Uploaded assets are dimension-checked at upload time; this also covers
  // legacy banner_url images. Caller falls back to a text-only welcome.
  if (W > 8000 || H > 8000 || W * H > 32_000_000) throw new Error('banner dimensions too large');
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(banner, 0, 0, W, H);

  const d = Math.round(opts.size * W); // diameter relative to width
  const cx = Math.round(opts.x * W);
  const cy = Math.round(opts.y * H);
  const r = d / 2;

  const avatar = await loadImage(opts.avatar);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, cx - r, cy - r, d, d);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, Math.round(d * 0.04));
  ctx.strokeStyle = '#22d3ee';
  ctx.stroke();

  if (opts.name) {
    const fontSize = Math.round(d * 0.22);
    // Keep the baseline on-canvas even when the avatar sits near the bottom edge.
    const textY = Math.min(cy + r + Math.round(d * 0.28), H - Math.round(fontSize * 0.25));
    ctx.font = `bold ${fontSize}px "${WELCOME_FONT_FAMILY}", sans-serif`;
    ctx.textAlign = 'center';
    // Dark halo behind the white name so it stays readable on light banners.
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.15));
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeText(opts.name, cx, textY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(opts.name, cx, textY);
  }

  return canvas.toBuffer('image/png');
}
