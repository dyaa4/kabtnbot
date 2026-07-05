import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { formatWelcome, renderWelcomeImage } from './welcome-image.js';

describe('formatWelcome', () => {
  it('substitutes user mention, server and count', () => {
    expect(formatWelcome('أهلاً {user} في {server}! ({count})', { user: '<@1>', server: 'ARAB', count: 42 }))
      .toBe('أهلاً <@1> في ARAB! (42)');
  });
});

function pngOf(width: number, height: number, color: string): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

describe('renderWelcomeImage', () => {
  const banner = pngOf(400, 200, '#dddddd');
  const avatar = pngOf(64, 64, '#2244ff');

  it('renders a PNG at the banner size from in-memory buffers', async () => {
    const out = await renderWelcomeImage({ banner, avatar, name: 'كابتن', x: 0.5, y: 0.4, size: 0.25 });
    expect(out.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const img = await loadImage(out);
    expect(img.width).toBe(400);
    expect(img.height).toBe(200);
  });

  it('renders without a name and with the avatar at the bottom edge', async () => {
    const out = await renderWelcomeImage({ banner, avatar, name: null, x: 0.5, y: 1, size: 0.25 });
    expect(out.length).toBeGreaterThan(0);
    const withName = await renderWelcomeImage({ banner, avatar, name: 'اسم طويل جداً', x: 0.5, y: 0.98, size: 0.3 });
    expect(withName.length).toBeGreaterThan(0);
  });

  it('rejects non-https banner and avatar URLs', async () => {
    await expect(
      renderWelcomeImage({ banner: 'http://169.254.169.254/x.png', avatar, name: null, x: 0.5, y: 0.5, size: 0.25 }),
    ).rejects.toThrow(/https/);
    await expect(
      renderWelcomeImage({ banner, avatar: 'http://internal/x.png', name: null, x: 0.5, y: 0.5, size: 0.25 }),
    ).rejects.toThrow(/https/);
  });
});
