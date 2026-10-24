import type { AvatarBackdropPattern } from '@psd/contracts';
import { describe, expect, it } from 'vitest';
import { backdropPreview, stretchBitmap, stretchSubject } from './backdropPreview.js';
import { DEFAULT_TUNING } from './cutOut.js';
import type { Bitmap, SubjectMask } from './types.js';

/**
 * ADR-224 — the cropper's picture with the backdrop behind the person.
 *
 * These pin the two things the preview has to get right: the person keeps the photograph, and everything
 * else takes the backdrop. The colour rules and the matte are exercised through the same functions the
 * saved sprite uses, so these tests are also a check that the preview asks the sprite's question.
 */

const GOLD = '#ffd700';

function bitmapOf(
  width: number,
  height: number,
  colourAt: (x: number, y: number) => [number, number, number],
): Bitmap {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = colourAt(x, y);
      pixels.set([red, green, blue, 255], (y * width + x) * 4);
    }
  }
  return { width, height, pixels };
}

function matteOf(width: number, height: number, isSubject: (x: number, y: number) => boolean): SubjectMask {
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      alpha[y * width + x] = isSubject(x, y) ? 255 : 0;
    }
  }
  return { width, height, alpha };
}

function hexAt(image: Bitmap, x: number, y: number): string {
  const at = (y * image.width + x) * 4;
  const channel = (offset: number) => (image.pixels[at + offset] ?? 0).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** Two halves: the person (left, a warm colour) and a green wall (right). */
const personLeftWallRight = () => bitmapOf(64, 64, (x) => (x < 32 ? [200, 60, 40] : [30, 120, 30]));
const personLeft = () => matteOf(64, 64, (x) => x < 32);

describe('backdropPreview (ADR-224)', () => {
  it('has nothing to paint when the cut-out is off, because the raw photograph is already the picture', () => {
    const photo = bitmapOf(16, 16, () => [200, 50, 50]);
    const tuning = { ...DEFAULT_TUNING, removeBackground: false };
    expect(
      backdropPreview(photo, { subject: null, tuning, backdrop: GOLD, sunburst: null }),
    ).toBeNull();
  });

  it('keeps the photograph where the person is, and paints the backdrop everywhere else', () => {
    const preview = backdropPreview(personLeftWallRight(), {
      subject: personLeft(),
      tuning: DEFAULT_TUNING,
      backdrop: GOLD,
      sunburst: null,
    });
    expect(preview).not.toBeNull();
    const picture = preview as Bitmap;
    // The same size as the photograph, so the crop square's coordinates still mean the same pixels.
    expect(picture.width).toBe(64);
    expect(picture.height).toBe(64);
    expect(hexAt(picture, 4, 32)).toBe('#c83c28');
    expect(hexAt(picture, 31, 32)).toBe('#c83c28');
    expect(hexAt(picture, 60, 4)).toBe(GOLD);
    expect(hexAt(picture, 32, 32)).toBe(GOLD);
  });

  it('keeps the frame whole when the photograph is not square', () => {
    const wide = bitmapOf(96, 48, (x) => (x < 48 ? [10, 20, 200] : [90, 90, 90]));
    const preview = backdropPreview(wide, {
      subject: matteOf(96, 48, (x) => x < 48),
      tuning: DEFAULT_TUNING,
      backdrop: GOLD,
      sunburst: null,
    }) as Bitmap;
    expect(preview.width).toBe(96);
    expect(preview.height).toBe(48);
    expect(hexAt(preview, 10, 10)).toBe('#0a14c8');
    expect(hexAt(preview, 90, 40)).toBe(GOLD);
  });

  it('decides by the colour rules when there is no matte, the same way the saved sprite does', () => {
    // A blue figure on a grey wall. The wall is the frame's own colour, so the rules take it.
    const photo = bitmapOf(64, 64, (x, y) =>
      x >= 20 && x < 44 && y >= 20 && y < 44 ? [40, 60, 220] : [128, 128, 128],
    );
    const preview = backdropPreview(photo, {
      subject: null,
      tuning: DEFAULT_TUNING,
      backdrop: GOLD,
      sunburst: null,
    }) as Bitmap;
    expect(hexAt(preview, 2, 2)).toBe(GOLD);
    expect(hexAt(preview, 32, 32)).toBe('#283cdc');
  });

  it('paints the backdrop pattern, so the picture carries the same bands the sprite does', () => {
    const spiral: AvatarBackdropPattern = { kind: 'spiral', rays: 6, twist: 0, bands: 3, colourTwo: '#0000ff' };
    const preview = backdropPreview(personLeftWallRight(), {
      subject: personLeft(),
      tuning: DEFAULT_TUNING,
      backdrop: GOLD,
      sunburst: spiral,
    }) as Bitmap;
    const wallColours = new Set<string>();
    for (let y = 0; y < 64; y += 1) {
      for (let x = 32; x < 64; x += 1) wallColours.add(hexAt(preview, x, y));
    }
    expect(wallColours.size).toBeGreaterThan(1);
    expect(hexAt(preview, 4, 32)).toBe('#c83c28');
  });
});

describe('stretchBitmap and stretchSubject (ADR-224)', () => {
  it('stretches the whole frame onto the square, sampling the middle of each cell', () => {
    const photo = bitmapOf(2, 1, (x) => (x === 0 ? [255, 0, 0] : [0, 0, 255]));
    const square = stretchBitmap(photo, 4);
    expect(square.width).toBe(4);
    expect(square.height).toBe(4);
    expect(hexAt(square, 0, 0)).toBe('#ff0000');
    expect(hexAt(square, 1, 2)).toBe('#ff0000');
    expect(hexAt(square, 2, 0)).toBe('#0000ff');
    expect(hexAt(square, 3, 3)).toBe('#0000ff');
  });

  it('stretches the matte the same way, so the decision sees the frame the photograph shows', () => {
    const square = stretchSubject(matteOf(2, 1, (x) => x === 0), 4);
    expect(Array.from(square.alpha.slice(0, 4))).toEqual([255, 255, 0, 0]);
    expect(square.width).toBe(4);
    expect(square.height).toBe(4);
  });
});
