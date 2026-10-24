import type { RgbaImage } from '@/shared/lib/raster';
import type { SubjectMatte } from './types';

/**
 * Deterministic synthetic test scene (ADDENDUM-017 §5): a 64×48 "hawker-centre" frame
 * with a lit face disc, a detached second head blob behind it, and a matching matte.
 * The blob is the case `pruneIslands` exists for: another diner over the subject's shoulder.
 */
export const HAWKER_WIDTH = 64;
export const HAWKER_HEIGHT = 48;
export const FACE_DISC = Object.freeze({ x: 32, y: 26, radius: 14 });
export const SECOND_HEAD = Object.freeze({ x: 50, y: 10, radius: 4 });

function insideDisc(x: number, y: number, disc: { x: number; y: number; radius: number }): boolean {
  return Math.hypot(x + 0.5 - disc.x, y + 0.5 - disc.y) <= disc.radius;
}

export function buildHawkerFrame(): RgbaImage {
  const data = new Uint8ClampedArray(HAWKER_WIDTH * HAWKER_HEIGHT * 4);
  for (let pixel = 0; pixel < HAWKER_WIDTH * HAWKER_HEIGHT; pixel += 1) {
    const x = pixel % HAWKER_WIDTH;
    const y = Math.floor(pixel / HAWKER_WIDTH);
    const isFace = insideDisc(x, y, FACE_DISC);
    const isStranger = insideDisc(x, y, SECOND_HEAD);
    const rgb = isFace ? [224, 172, 138] : isStranger ? [120, 92, 80] : [40 + (x % 8) * 6, 70, 60 + (y % 6) * 8];
    data.set([rgb[0], rgb[1], rgb[2], 255], pixel * 4);
  }
  return { width: HAWKER_WIDTH, height: HAWKER_HEIGHT, data };
}

/** Matte with a soft (200) subject core, a hard 255 centre and a fully-opaque stranger blob. */
export function buildHawkerMatte(): SubjectMatte {
  const data = new Uint8ClampedArray(HAWKER_WIDTH * HAWKER_HEIGHT);
  for (let pixel = 0; pixel < data.length; pixel += 1) {
    const x = pixel % HAWKER_WIDTH;
    const y = Math.floor(pixel / HAWKER_WIDTH);
    if (insideDisc(x, y, { ...FACE_DISC, radius: 6 })) data[pixel] = 255;
    else if (insideDisc(x, y, FACE_DISC)) data[pixel] = 200;
    else if (insideDisc(x, y, SECOND_HEAD)) data[pixel] = 255;
  }
  return { width: HAWKER_WIDTH, height: HAWKER_HEIGHT, data };
}

/** The 48×48 square of the frame that holds the face, as the face detector would frame it. */
export const HAWKER_CROP = Object.freeze({ x: 8, y: 0, size: 48 });
