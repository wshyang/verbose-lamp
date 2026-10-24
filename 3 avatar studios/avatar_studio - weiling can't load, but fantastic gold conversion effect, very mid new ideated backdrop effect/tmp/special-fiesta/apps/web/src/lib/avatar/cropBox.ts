import type { CropBox } from './photoSprite.js';

/**
 * ADR-036 — the geometry behind "choose it yourself".
 *
 * When nothing can find the face — no Shape Detection API, no model, and a background
 * the colour rules cannot read — the participant is shown their photo and drags a square
 * over their own head. Square is not negotiable: the sprite is 128×128, so anything else
 * would either stretch a face or crop one twice.
 *
 * All of it is arithmetic on a box inside a box, which is why it lives here rather than
 * in the component: a pointer is hard to test, a rectangle is not.
 */

export interface Frame {
  width: number;
  height: number;
}

/** Never smaller than this share of the photo, or the sprite is upscaled mush. */
const MIN_SHARE = 0.2;

export function clampBox(box: CropBox, frame: Frame): CropBox {
  const largest = Math.min(frame.width, frame.height);
  const size = Math.min(Math.max(box.size, largest * MIN_SHARE), largest);
  return {
    size,
    x: Math.min(Math.max(box.x, 0), frame.width - size),
    y: Math.min(Math.max(box.y, 0), frame.height - size),
  };
}

/** A square over the middle of the photo, the size of its shorter side less a margin. */
export function startingBox(frame: Frame): CropBox {
  const size = Math.min(frame.width, frame.height) * 0.8;
  return clampBox({ x: (frame.width - size) / 2, y: (frame.height - size) / 2, size }, frame);
}

export function moveBox(box: CropBox, by: { x: number; y: number }, frame: Frame): CropBox {
  return clampBox({ ...box, x: box.x + by.x, y: box.y + by.y }, frame);
}

/**
 * Resizing drags the bottom-right corner, so the box grows away from its top-left and
 * stays square whichever way the finger actually moved.
 */
export function resizeBox(box: CropBox, by: { x: number; y: number }, frame: Frame): CropBox {
  const wanted = box.size + Math.max(by.x, by.y);
  const room = Math.min(frame.width - box.x, frame.height - box.y);
  const largest = Math.min(frame.width, frame.height);
  const size = Math.min(Math.max(wanted, largest * MIN_SHARE), room);
  return clampBox({ ...box, size }, frame);
}

/**
 * The box drawn on screen, translated to the photo's own pixels — the displayed image is
 * whatever width the phone gave it, and the crop has to be in the coordinates the sprite
 * pipeline works in.
 */
export function boxToPhoto(box: CropBox, shown: Frame, photo: Frame): CropBox {
  const scale = photo.width / shown.width;
  return clampBox(
    { x: box.x * scale, y: box.y * scale, size: box.size * scale },
    { width: photo.width, height: photo.height },
  );
}

/**
 * The inverse: a crop in the photo's own pixels, placed on the displayed image.
 *
 * ADR-056 — this is what lets the square start on the face the detector found instead of in the
 * middle of the frame. The detector answers in photo coordinates; the participant drags in screen
 * coordinates; the square has to be handed to them in theirs.
 */
export function photoToBox(box: CropBox, shown: Frame, photo: Frame): CropBox {
  const scale = shown.width / photo.width;
  return clampBox({ x: box.x * scale, y: box.y * scale, size: box.size * scale }, shown);
}
