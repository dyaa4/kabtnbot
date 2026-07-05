import { createCanvas, loadImage } from '@napi-rs/canvas';

export function formatWelcome(template: string, vars: { user: string; server: string; count: number }): string {
  return template
    .replaceAll('{user}', vars.user)
    .replaceAll('{server}', vars.server)
    .replaceAll('{count}', String(vars.count));
}

export async function renderWelcomeImage(opts: {
  bannerUrl: string;
  avatarUrl: string;
  name: string | null;
  x: number;
  y: number;
  size: number;
}): Promise<Buffer> {
  // Guild-admin-gated but cheap to harden: reject non-https URLs so an admin can't point
  // banner_url at internal/metadata endpoints (e.g. http://169.254.169.254). The caller
  // catches and falls back to a text-only welcome.
  if (!opts.bannerUrl.startsWith('https://')) throw new Error('bannerUrl must be https');
  const banner = await loadImage(opts.bannerUrl);
  const W = banner.width;
  const H = banner.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(banner, 0, 0, W, H);

  const d = Math.round(opts.size * W); // diameter relative to width
  const cx = Math.round(opts.x * W);
  const cy = Math.round(opts.y * H);
  const r = d / 2;

  const avatar = await loadImage(opts.avatarUrl);
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
    ctx.font = `bold ${Math.round(d * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(opts.name, cx, cy + r + Math.round(d * 0.28));
  }

  return canvas.toBuffer('image/png');
}
