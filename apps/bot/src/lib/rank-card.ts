import { createCanvas, loadImage } from '@napi-rs/canvas';
import { levelProgress } from '@gamebot/shared';
// Importing this registers the bundled Cairo font (side effect) and gives us the
// family name — reused so Arabic usernames render instead of empty boxes.
import { WELCOME_FONT_FAMILY } from './welcome-image.js';

/** Renders a 900×260 rank card (avatar, name, rank/level, XP progress bar). */
export async function renderRankCard(opts: {
  avatar: string | Buffer; // avatar bytes or https CDN URL
  username: string;
  xp: number;
  rank: number | null;
}): Promise<Buffer> {
  if (typeof opts.avatar === 'string' && !opts.avatar.startsWith('https://')) {
    throw new Error('avatar URL must be https');
  }
  const W = 900;
  const H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  const { level, intoLevel, neededForNext } = levelProgress(opts.xp);

  // Avatar — circular, cyan ring
  const r = 80;
  const cx = 140;
  const cy = H / 2;
  const avatar = await loadImage(opts.avatar);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#22d3ee';
  ctx.stroke();

  const x = 260;
  ctx.textAlign = 'left';

  const name = opts.username.length > 20 ? `${opts.username.slice(0, 19)}…` : opts.username;
  ctx.font = `bold 40px "${WELCOME_FONT_FAMILY}", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, x, 92);

  ctx.font = `600 26px "${WELCOME_FONT_FAMILY}", sans-serif`;
  ctx.fillStyle = '#a5b4fc';
  ctx.fillText(`RANK ${opts.rank ? `#${opts.rank}` : '—'}     LVL ${level}`, x, 134);

  // XP bar
  const barX = x;
  const barY = 168;
  const barW = 560;
  const barH = 34;
  const rad = barH / 2;
  const pct = neededForNext > 0 ? Math.min(1, intoLevel / neededForNext) : 0;

  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, rad);
  ctx.fill();

  if (pct > 0) {
    const fg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fg.addColorStop(0, '#6366f1');
    fg.addColorStop(1, '#22d3ee');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(barH, barW * pct), barH, rad);
    ctx.fill();
  }

  ctx.font = `500 22px "${WELCOME_FONT_FAMILY}", sans-serif`;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`${intoLevel} / ${neededForNext} XP`, barX, barY + barH + 32);

  return canvas.toBuffer('image/png');
}
