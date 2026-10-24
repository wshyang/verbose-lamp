import { describe, expect, it } from 'vitest';
import { AVATAR_SPRITE_MAX_COLOURS, AVATAR_SPRITE_SIZE, parseAvatarSprite } from '@psd/contracts';
import { DEFAULT_TUNING } from './cutOut.js';
import { faceBox, paintPrepared, photoToSprite, preparePhotoCells, type Bitmap } from './photoSprite.js';

/**
 * ADR-031 — the photo pipeline, over bitmaps built here rather than photographs. A real
 * portrait is reviewed by eye (`npm run photo:review`); what is asserted here is the part
 * that has to be true of every photo: the face is found, the background becomes the
 * backdrop, the subject gets a contour, and the result is a sprite the contract accepts.
 */

const COLOURS = { backdrop: '#1d5b8c', ink: '#12243a' };

function blank(width: number, height: number, colour: [number, number, number]): Bitmap {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = colour[0];
    pixels[index * 4 + 1] = colour[1];
    pixels[index * 4 + 2] = colour[2];
    pixels[index * 4 + 3] = 255;
  }
  return { width, height, pixels };
}

function paint(bitmap: Bitmap, colour: [number, number, number], inside: (x: number, y: number) => boolean) {
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (!inside(x, y)) continue;
      const at = (y * bitmap.width + x) * 4;
      bitmap.pixels[at] = colour[0];
      bitmap.pixels[at + 1] = colour[1];
      bitmap.pixels[at + 2] = colour[2];
    }
  }
}

/** A passport photo in the abstract: grey studio, hair, a skin oval, two dark eyes. */
function portrait(): Bitmap {
  const bitmap = blank(200, 200, [232, 232, 232]);
  const ellipse = (at: { cx: number; cy: number; rx: number; ry: number }) => (x: number, y: number) =>
    ((x - at.cx) / at.rx) ** 2 + ((y - at.cy) / at.ry) ** 2 <= 1;
  paint(bitmap, [28, 22, 20], ellipse({ cx: 100, cy: 78, rx: 54, ry: 62 }));
  paint(bitmap, [224, 168, 120], ellipse({ cx: 100, cy: 92, rx: 44, ry: 52 }));
  paint(bitmap, [40, 30, 28], ellipse({ cx: 82, cy: 84, rx: 7, ry: 4 }));
  paint(bitmap, [40, 30, 28], ellipse({ cx: 118, cy: 84, rx: 7, ry: 4 }));
  paint(bitmap, [150, 70, 70], ellipse({ cx: 100, cy: 120, rx: 12, ry: 4 }));
  paint(bitmap, [30, 40, 90], (x, y) => y > 160 && Math.abs(x - 100) < 70);
  return bitmap;
}

describe('photo → sprite', () => {
  it('crops to the head, in the framing the drawn avatars use', () => {
    const box = faceBox(portrait());

    // The crop is square, inside the photo, and centred on the face rather than the frame.
    expect(box.size).toBeGreaterThan(60);
    expect(box.size).toBeLessThanOrEqual(200);
    expect(box.x + box.size).toBeLessThanOrEqual(200);
    expect(Math.abs(box.x + box.size / 2 - 100)).toBeLessThan(12);
  });

  it('centres the frame when it cannot find a face at all', () => {
    const box = faceBox(blank(240, 160, [12, 12, 12]));

    expect(box.size).toBe(160);
    expect(box.x).toBe(40);
    expect(box.y).toBe(0);
  });

  it('produces a sprite the contract accepts', () => {
    const code = photoToSprite(portrait(), COLOURS);
    const sprite = parseAvatarSprite(code);

    expect(sprite).not.toBeNull();
    expect(sprite?.size).toBe(AVATAR_SPRITE_SIZE);
    expect(sprite?.rows).toHaveLength(AVATAR_SPRITE_SIZE);
    expect(Object.keys(sprite?.palette ?? {}).length).toBeLessThanOrEqual(AVATAR_SPRITE_MAX_COLOURS);
    // Small enough to sit in a column; rows carry only its id anyway (ADR-035).
    expect(code.length).toBeLessThan(24000);
  });

  it('paints the studio background with the chosen backdrop, and inks the subject', () => {
    const sprite = parseAvatarSprite(photoToSprite(portrait(), COLOURS));
    const rows = sprite?.rows ?? [];
    const palette = sprite?.palette ?? {};
    const colourAt = (x: number, y: number) => palette[rows[y]?.charAt(x) ?? ''];

    // The corners are the backdrop the participant chose, not the photographer's wall.
    for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127]]) {
      expect(colourAt(x ?? 0, y ?? 0)).toBe(COLOURS.backdrop);
    }
    // And the silhouette has an ink line somewhere down its side.
    expect(Object.values(palette)).toContain(COLOURS.ink);
    expect(rows.some((row) => row.includes(inkKey(palette)))).toBe(true);
  });

  it('keeps the subject: the middle of the sprite is the face, not the backdrop', () => {
    const sprite = parseAvatarSprite(photoToSprite(portrait(), COLOURS));
    const palette = sprite?.palette ?? {};
    const middle = (sprite?.rows[64] ?? '').slice(40, 88);
    const backdropCells = [...middle].filter((key) => palette[key] === COLOURS.backdrop).length;

    expect(backdropCells).toBe(0);
  });

  it('removes a lit teal booth wall without eating the clothes (ADR-032)', () => {
    // The induction booth: teal fabric, a hotspot behind the head, a shadow down one
    // side, a vignette, and shoulders that run off the bottom edge.
    const bitmap = blank(200, 200, [38, 110, 104]);
    // A hotspot and a vignette, both smooth — a wall is lit, not stencilled.
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        const glow = Math.max(0, 1 - Math.hypot(x - 96, y - 70) / 90);
        const corner = Math.min(1, Math.hypot(x - 100, y - 100) / 140);
        const lift = glow * 34 - corner * 22;
        const at = (y * 200 + x) * 4;
        bitmap.pixels[at] = 38 + lift * 0.8;
        bitmap.pixels[at + 1] = 110 + lift;
        bitmap.pixels[at + 2] = 104 + lift * 0.9;
      }
    }
    const ellipse = (at: { cx: number; cy: number; rx: number; ry: number }) => (x: number, y: number) =>
      ((x - at.cx) / at.rx) ** 2 + ((y - at.cy) / at.ry) ** 2 <= 1;
    paint(bitmap, [26, 20, 18], ellipse({ cx: 100, cy: 80, rx: 50, ry: 58 }));
    paint(bitmap, [222, 170, 126], ellipse({ cx: 100, cy: 92, rx: 40, ry: 48 }));
    paint(bitmap, [40, 30, 28], ellipse({ cx: 84, cy: 84, rx: 7, ry: 4 }));
    paint(bitmap, [40, 30, 28], ellipse({ cx: 116, cy: 84, rx: 7, ry: 4 }));
    // A white blouse, reaching the bottom edge of the frame.
    paint(bitmap, [236, 236, 240], (x, y) => y > 150 && Math.abs(x - 100) < 78);

    const sprite = parseAvatarSprite(photoToSprite(bitmap, COLOURS));
    const palette = sprite?.palette ?? {};
    const rows = sprite?.rows ?? [];
    const colours = rows.map((row) => [...row].map((key) => palette[key] ?? ''));

    // Above the head there is nothing but backdrop: hotspot, shadow and vignette all go.
    const above = colours.slice(0, 12).flat();
    expect(above.every((hex) => hex === COLOURS.backdrop || hex === COLOURS.ink)).toBe(true);

    // What teal is left is the one-cell blend along the subject's edge, which is what the
    // ink line is drawn over — not a patch of wall.
    const teal = colours.flat().filter((hex) => {
      if (hex === COLOURS.backdrop || hex === COLOURS.ink) return false;
      const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) || 0);
      return (g ?? 0) > (r ?? 0) + 25 && (b ?? 0) > (r ?? 0) + 15;
    });
    expect(teal.length).toBeLessThan(300);
    // And the blouse is still there, at the bottom of the frame.
    const bottom = colours[126] ?? [];
    expect(bottom.filter((hex) => hex !== COLOURS.backdrop && hex !== COLOURS.ink).length)
      .toBeGreaterThan(20);
  });

  it('works with a cool wall and a warm shirt, the hues on opposite sides of the circle', () => {
    // A blue booth screen behind an orange shirt: the hue comparison has to wrap around,
    // which a teal wall and warm skin never make it do. (A *beige* wall is deliberately
    // not removed — the skin rule protects it, and keeping a wall beats erasing a face.)
    const bitmap = blank(200, 200, [54, 86, 186]);
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        const lift = Math.max(0, 1 - Math.hypot(x - 90, y - 60) / 100) * 34;
        const at = (y * 200 + x) * 4;
        bitmap.pixels[at] = 54 + lift * 0.6;
        bitmap.pixels[at + 1] = 86 + lift * 0.8;
        bitmap.pixels[at + 2] = 186 + lift;
      }
    }
    paint(bitmap, [30, 24, 20], (x, y) => ((x - 100) / 48) ** 2 + ((y - 78) / 56) ** 2 <= 1);
    paint(bitmap, [216, 166, 122], (x, y) => ((x - 100) / 38) ** 2 + ((y - 90) / 46) ** 2 <= 1);
    paint(bitmap, [226, 138, 52], (_x, y) => y > 150);

    const sprite = parseAvatarSprite(photoToSprite(bitmap, COLOURS));
    const rows = sprite?.rows ?? [];
    const palette = sprite?.palette ?? {};

    expect([...(rows[2] ?? '')].every((key) => palette[key] === COLOURS.backdrop)).toBe(true);
    const bottom = [...(rows[126] ?? '')].map((key) => palette[key]);
    expect(bottom.filter((hex) => hex !== COLOURS.backdrop && hex !== COLOURS.ink).length)
      .toBeGreaterThan(40);
  });

  it('keeps a busy selfie whole rather than carving holes in it (ADR-034)', () => {
    // A face in front of a street: nothing here is a wall, and the colour rules know it.
    const bitmap = blank(160, 160, [0, 0, 0]);
    for (let y = 0; y < 160; y += 1) {
      for (let x = 0; x < 160; x += 1) {
        const at = (y * 160 + x) * 4;
        bitmap.pixels[at] = (x * 7 + y * 3) % 200;
        bitmap.pixels[at + 1] = (x * 3 + y * 11) % 200;
        bitmap.pixels[at + 2] = (x * 13 + y * 5) % 200;
      }
    }
    paint(bitmap, [226, 172, 128], (x, y) => ((x - 80) / 34) ** 2 + ((y - 74) / 42) ** 2 <= 1);

    const sprite = parseAvatarSprite(photoToSprite(bitmap, COLOURS));
    const palette = sprite?.palette ?? {};
    const cells = (sprite?.rows ?? []).flatMap((row) => [...row].map((key) => palette[key]));
    const backdrop = cells.filter((hex) => hex === COLOURS.backdrop).length;

    // Almost nothing was removed — and what is left is the photograph, pixelated, which
    // is a perfectly good avatar and infinitely better than a face full of holes.
    expect(backdrop).toBeLessThan(320);
    expect(sprite).not.toBeNull();
  });

  it('survives a photo with nothing in it', () => {
    const sprite = parseAvatarSprite(photoToSprite(blank(64, 64, [200, 200, 200]), COLOURS));

    // A picture of a wall is not a portrait: everything matching means nothing did, so
    // the wall is kept rather than replaced by a flat rectangle of backdrop.
    expect(sprite).not.toBeNull();
    // The wall's own grey, lifted a little by the contrast pass, is still in the palette.
    expect(Object.values(sprite?.palette ?? {}).length).toBe(3);
    expect(Object.values(sprite?.palette ?? {})[0]).toMatch(/^#c[a-f0-9]{5}$/);
  });

  it('handles a photo smaller than the sprite it becomes', () => {
    const tiny = blank(32, 48, [230, 230, 230]);
    paint(tiny, [220, 160, 110], (x, y) => Math.abs(x - 16) < 9 && Math.abs(y - 20) < 12);

    expect(parseAvatarSprite(photoToSprite(tiny, COLOURS))).not.toBeNull();
  });

  /*
   * ADR-072/073 — the seam the tuning controls paint through. `photoToSprite` is now the composition
   * of an expensive half that depends only on the photograph and the square, and a cheap half that
   * depends on the mask; these pin that composing them by hand gives the same answer, and that a
   * tuning handed in is actually honoured rather than quietly defaulted.
   */
  describe('the prepared/painted seam', () => {
    const portrait = () => {
      const photo = blank(160, 200, [225, 225, 228]);
      paint(photo, [215, 165, 120], (x, y) => Math.abs(x - 80) < 34 && Math.abs(y - 92) < 44);
      return photo;
    };

    it('composes to exactly what the whole pipeline produces', () => {
      const photo = portrait();
      const crop = { x: 20, y: 20, size: 140 };

      const whole = photoToSprite(photo, { ...COLOURS, crop });
      const byHalves = paintPrepared(preparePhotoCells(photo, crop), { ...COLOURS, crop });

      expect(byHalves).toBe(whole);
    });

    it('reuses one prepared half across two different tunings', () => {
      const prepared = preparePhotoCells(portrait(), { x: 20, y: 20, size: 140 });

      const trimmed = paintPrepared(prepared, {
        ...COLOURS,
        tuning: { ...DEFAULT_TUNING, edge: -2 },
      });
      const grown = paintPrepared(prepared, { ...COLOURS, tuning: { ...DEFAULT_TUNING, edge: 2 } });

      expect(parseAvatarSprite(trimmed)).not.toBeNull();
      expect(parseAvatarSprite(grown)).not.toBeNull();
      expect(trimmed).not.toBe(grown);
    });

    /*
     * ADR-077 — with the cut-out off, no cell may be the backdrop and nothing may be inked. Asserted
     * on the palette indices rather than on the picture, because that is the invariant: the backdrop
     * and ink entries are still emitted (the format always carries sixteen) and simply go unused.
     */
    it('paints no backdrop and no contour when the cut-out is off', () => {
      const prepared = preparePhotoCells(portrait(), { x: 20, y: 20, size: 140 });
      const code = paintPrepared(prepared, {
        ...COLOURS,
        tuning: { ...DEFAULT_TUNING, removeBackground: false },
      });
      const sprite = parseAvatarSprite(code);
      const colours = Object.keys(sprite?.palette ?? {}).length;
      const backdropKey = (colours - 2).toString(16);
      const inkKeyUsed = (colours - 1).toString(16);
      const painted = (sprite?.rows ?? []).join('');

      expect(sprite).not.toBeNull();
      expect(painted).not.toContain(backdropKey);
      expect(painted).not.toContain(inkKeyUsed);
    });

    it('does cut a backdrop in when the cut-out is on, for contrast with the above', () => {
      const prepared = preparePhotoCells(portrait(), { x: 20, y: 20, size: 140 });
      const code = paintPrepared(prepared, { ...COLOURS, tuning: DEFAULT_TUNING });
      const sprite = parseAvatarSprite(code);
      const colours = Object.keys(sprite?.palette ?? {}).length;
      const painted = (sprite?.rows ?? []).join('');

      expect(painted).toContain((colours - 2).toString(16));
    });

    it('defaults the tuning when none is handed in', () => {
      const photo = portrait();
      const crop = { x: 20, y: 20, size: 140 };

      expect(photoToSprite(photo, { ...COLOURS, crop })).toBe(
        photoToSprite(photo, { ...COLOURS, crop, tuning: DEFAULT_TUNING }),
      );
    });
  });
});

function inkKey(palette: Record<string, string>): string {
  return Object.entries(palette).find(([, hex]) => hex === COLOURS.ink)?.[0] ?? '?';
}
