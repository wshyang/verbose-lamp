import type { RasterDimensions, SquareBox } from '@/shared/lib/raster';
import type { FaceDetection } from './types';

/**
 * Pure avatar framing from a face detection, ported from the reference studio's
 * `locateFace.ts` (ADDENDUM-017 §2).
 *
 * Adult inter-pupillary distance is ~63 mm against a ~230 mm chin-to-crown head, so a head
 * is about 3.65 inter-ocular distances tall, and the head gets 72 % of the crop. Eye
 * distance is the steadiest scale in a photo: it does not move with clothing or posture.
 */
export const CROP_PER_INTER_OCULAR = 3.65 / 0.72;
/** The eyes sit 52 % of the way down the square. */
export const EYE_LINE = 0.52;
/** A detector box is the face; a head is about half as tall again. Used only as a floor. */
export const HEAD_OVER_FACE = 1.45;
export const HEAD_SHARE = 0.72;
/** Eyes closer than this (in pixels) cannot be measured reliably. */
const MIN_EYE_SPAN = 2;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The biggest face in the picture: in a group shot, the one whose photo this is. */
export function largestFace(detections: readonly FaceDetection[]): FaceDetection | null {
  return detections.reduce<FaceDetection | null>((best, face) => {
    if (best === null) return face;
    return (face.boundingBox?.width ?? 0) > (best.boundingBox?.width ?? 0) ? face : best;
  }, null);
}

/**
 * The square avatar crop for a face, or null when the eyes are missing or degenerate.
 *
 * Eye distance shrinks as a head turns, so the detector's box height is kept as a floor:
 * a profile comes out framed a little wide rather than cropped into. The crop is a
 * square, so it is capped at the photo's shortest edge, never its longest.
 */
export function cropFromDetection(face: FaceDetection, frame: RasterDimensions): SquareBox | null {
  const [right, left] = face.keypoints ?? [];
  if (right === undefined || left === undefined) return null;
  const eyes = { x: ((right.x + left.x) / 2) * frame.width, y: ((right.y + left.y) / 2) * frame.height };
  const apart = Math.hypot((right.x - left.x) * frame.width, (right.y - left.y) * frame.height);
  // `apart` is derived from the same four numbers, so a finite `apart` above the
  // minimum already proves the midpoint is finite.
  if (!Number.isFinite(apart) || apart < MIN_EYE_SPAN) return null;

  const shortest = Math.min(frame.width, frame.height);
  const fromEyes = apart * CROP_PER_INTER_OCULAR;
  const fromBox = ((face.boundingBox?.height ?? 0) * HEAD_OVER_FACE) / HEAD_SHARE;
  const size = Math.min(shortest, Math.max(fromEyes, fromBox));
  return {
    x: clamp(eyes.x - size / 2, 0, Math.max(0, frame.width - size)),
    y: clamp(eyes.y - size * EYE_LINE, 0, Math.max(0, frame.height - size)),
    size,
  };
}
