import { createCanvas, loadImage } from '@napi-rs/canvas';

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
  // Guild-admin-gated but cheap to harden: reject non-https URLs so an admin can't point
  // banner_url at internal/metadata endpoints (e.g. http://169.254.169.254). The caller
  // catches and falls back to a text-only welcome.
  if (typeof opts.banner === 'string' && !opts.banner.startsWith('https://')) {
    throw new Error('banner URL must be https');
  }
  if (typeof opts.avatar === 'string' && !opts.avatar.startsWith('https://')) {
    throw new Error('avatar URL must be https');
  }
  const banner = await loadImage(opts.banner);
  const W = banner.width;
  const H = banner.height;
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
    ctx.font = `bold ${fontSize}px sans-serif`;
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
