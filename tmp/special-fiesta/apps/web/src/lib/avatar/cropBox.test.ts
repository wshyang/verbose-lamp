import { describe, expect, it } from 'vitest';
import { boxToPhoto, clampBox, moveBox, photoToBox, resizeBox, startingBox } from './cropBox.js';

/** ADR-036 — the square the participant drags. Always square, always inside the photo. */

const frame = { width: 300, height: 200 };

describe('crop box', () => {
  it('starts centred on the picture', () => {
    const box = startingBox(frame);

    expect(box.size).toBe(160);
    expect(box.x + box.size / 2).toBe(150);
    expect(box.y + box.size / 2).toBe(100);
  });

  it('cannot be dragged out of the picture', () => {
    const box = startingBox(frame);

    expect(moveBox(box, { x: -1000, y: -1000 }, frame)).toMatchObject({ x: 0, y: 0 });
    expect(moveBox(box, { x: 1000, y: 1000 }, frame)).toMatchObject({ x: 140, y: 40 });
  });

  it('grows and shrinks, and stays square', () => {
    const box = { x: 40, y: 20, size: 100 };

    const bigger = resizeBox(box, { x: 60, y: 10 }, frame);
    expect(bigger.size).toBe(160);
    // It grew from the top-left corner, which stays put.
    expect(bigger).toMatchObject({ x: 40, y: 20 });

    const smaller = resizeBox(box, { x: -60, y: -80 }, frame);
    expect(smaller.size).toBe(40);
  });

  it('will not grow past the edge, or shrink into nothing', () => {
    const corner = { x: 220, y: 150, size: 50 };

    // Only 80 × 50 of room is left, so 50 is as big as it gets.
    expect(resizeBox(corner, { x: 500, y: 500 }, frame).size).toBe(50);
    // A fifth of the shorter side is the floor: 40 here, however hard it is pinched.
    expect(resizeBox({ x: 0, y: 0, size: 60 }, { x: -500, y: -500 }, frame).size).toBe(40);
  });

  it('clamps whatever it is handed', () => {
    expect(clampBox({ x: -50, y: -50, size: 5000 }, frame)).toEqual({ x: 0, y: 0, size: 200 });
  });

  it('translates the square on screen into the photo it was drawn over', () => {
    const shown = { width: 240, height: 240 };
    const photo = { width: 960, height: 960 };

    // A quarter-size preview: everything multiplies by four.
    expect(boxToPhoto({ x: 30, y: 15, size: 120 }, shown, photo)).toEqual({
      x: 120,
      y: 60,
      size: 480,
    });
  });
});

/**
 * ADR-056 — placing a detector's crop onto the displayed image.
 *
 * `photoToBox` is the inverse of `boxToPhoto`, and it exists so the square can OPEN on the face
 * that was found rather than in the middle of the frame.
 */
describe('photoToBox', () => {
  it('scales a photo-space crop down onto a smaller displayed image', () => {
    const shown = { width: 320, height: 240 };
    const photo = { width: 640, height: 480 };

    const placed = photoToBox({ x: 200, y: 100, size: 160 }, shown, photo);

    expect(placed).toEqual({ x: 100, y: 50, size: 80 });
  });

  it('round-trips with boxToPhoto, because the two must agree', () => {
    const shown = { width: 300, height: 400 };
    const photo = { width: 600, height: 800 };
    const original = { x: 120, y: 200, size: 240 };

    const placed = photoToBox(original, shown, photo);

    // What the participant sees, converted back, is the crop we started from.
    expect(boxToPhoto(placed, shown, photo)).toEqual(original);
  });

  it('keeps a crop that overhangs the frame inside it', () => {
    const shown = { width: 200, height: 200 };
    const photo = { width: 400, height: 400 };

    const placed = photoToBox({ x: 380, y: 380, size: 200 }, shown, photo);

    expect(placed.x + placed.size).toBeLessThanOrEqual(200);
    expect(placed.y + placed.size).toBeLessThanOrEqual(200);
  });
});
