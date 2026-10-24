import type { RasterDimensions, SquareBox } from '@/shared/lib/raster';

/**
 * Square-in-rectangle math for the manual cropper, ported unchanged from the reference
 * `cropBox.ts`. The square never leaves the photo and never shrinks below 20 % of its
 * short edge, so a stray drag cannot produce a crop too small to read.
 */
const MIN_SHARE = 0.2;
const STARTING_SHARE = 0.8;

export function clampBox(box: SquareBox, frame: RasterDimensions): SquareBox {
  const largest = Math.min(frame.width, frame.height);
  const size = Math.min(Math.max(box.size, largest * MIN_SHARE), largest);
  return {
    size,
    x: Math.min(Math.max(box.x, 0), frame.width - size),
    y: Math.min(Math.max(box.y, 0), frame.height - size),
  };
}

/** Where the manual square opens when no face was found: centred, 80 % of the short edge. */
export function startingBox(frame: RasterDimensions): SquareBox {
  const size = Math.min(frame.width, frame.height) * STARTING_SHARE;
  return clampBox({ x: (frame.width - size) / 2, y: (frame.height - size) / 2, size }, frame);
}

export function moveBox(box: SquareBox, by: { x: number; y: number }, frame: RasterDimensions): SquareBox {
  return clampBox({ ...box, x: box.x + by.x, y: box.y + by.y }, frame);
}

/** Resize from the bottom-right handle, keeping the top-left corner where it is. */
export function resizeBox(box: SquareBox, by: { x: number; y: number }, frame: RasterDimensions): SquareBox {
  const wanted = box.size + Math.max(by.x, by.y);
  const room = Math.min(frame.width - box.x, frame.height - box.y);
  const largest = Math.min(frame.width, frame.height);
  const size = Math.min(Math.max(wanted, largest * MIN_SHARE), room);
  return clampBox({ ...box, size }, frame);
}

/** From on-screen pixels to photo pixels. */
export function boxToPhoto(box: SquareBox, shown: RasterDimensions, photo: RasterDimensions): SquareBox {
  const scale = photo.width / shown.width;
  return clampBox({ x: box.x * scale, y: box.y * scale, size: box.size * scale }, photo);
}

/** From photo pixels to on-screen pixels. */
export function photoToBox(box: SquareBox, shown: RasterDimensions, photo: RasterDimensions): SquareBox {
  const scale = shown.width / photo.width;
  return clampBox({ x: box.x * scale, y: box.y * scale, size: box.size * scale }, shown);
}
