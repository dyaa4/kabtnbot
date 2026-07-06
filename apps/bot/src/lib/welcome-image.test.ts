import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { formatWelcome, renderWelcomeImage, WELCOME_FONT_FAMILY } from './welcome-image.js';

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

  it('registers the bundled Arabic font (slim servers ship no fonts)', () => {
    expect(GlobalFonts.families.some((f) => f.family === WELCOME_FONT_FAMILY)).toBe(true);
  });

  it('actually draws the Arabic member name — bright pixels below the avatar', async () => {
    // All-black banner and avatar: any bright pixel in the name band must be text.
    const blackBanner = pngOf(400, 200, '#000000');
    const blackAvatar = pngOf(64, 64, '#000000');
    const out = await renderWelcomeImage({
      banner: blackBanner,
      avatar: blackAvatar,
      name: 'مرحبا يا كابتن',
      x: 0.5,
      y: 0.3,
      size: 0.25,
    });
    const img = await loadImage(out);
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    // Baseline ≈ cy + r + 0.28d = 60 + 50 + 28 = 138; scan the band around it.
    // The white fill is (255,255,255); the cyan ring fails the red channel check.
    const data = ctx.getImageData(100, 118, 200, 40).data;
    let bright = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) bright++;
    }
    expect(bright).toBeGreaterThan(20);
  });

  it('rejects banners with oversized dimensions', async () => {
    const wide = pngOf(8001, 4, '#000000');
    await expect(
      renderWelcomeImage({ banner: wide, avatar, name: null, x: 0.5, y: 0.5, size: 0.25 }),
    ).rejects.toThrow(/dimensions/);
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
