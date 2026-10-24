import type { PixelPlane, SubjectMatte } from './types';

/**
 * The plane to read the matte from, whichever shape the pipeline answered in:
 * `background-removal` returns one image whose alpha is the matte; `image-segmentation`
 * style results are a list of `{ mask }`. Anything else is not a matte.
 */
export function planeOf(result: unknown): PixelPlane | null {
  const answer: unknown = Array.isArray(result) ? result[0] : result;
  if (answer === null || typeof answer !== 'object') return null;
  const candidate = answer as { mask?: unknown; data?: unknown };
  if (candidate.mask !== null && typeof candidate.mask === 'object') return candidate.mask as PixelPlane;
  if (candidate.data !== undefined) return answer as PixelPlane;
  return null;
}

/**
 * One byte of subject-ness per pixel. A one-channel plane already is that; a four-channel
 * image carries it in alpha. Any other channel count, or a buffer that does not match its
 * dimensions, is a fall-back (null), not a guess.
 */
export function alphaOf(plane: PixelPlane): SubjectMatte | null {
  const { width, height } = plane;
  const channels = plane.channels ?? 1;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (plane.data.length !== width * height * channels) return null;
  if (channels === 1) return { width, height, data: Uint8ClampedArray.from(plane.data) };
  if (channels !== 4) return null;
  const data = new Uint8ClampedArray(width * height);
  for (let at = 0; at < data.length; at += 1) data[at] = Number(plane.data[at * 4 + 3]);
  return { width, height, data };
}
