import type { AlphaMask, CropBox, FaceDetection, RgbaImage } from './types';

/**
 * Face → square head crop, ported from the reference app's `locateFace.ts` (ADR-054).
 *
 * Inter-ocular distance sets the scale (a head is ~3.65 eye-distances tall, given 72 %
 * of the crop); the detector's box height is a floor so a turned head is framed wide
 * rather than cropped into. The eye line sits at 52 % of the crop.
 */
const HEAD_SHARE = 0.72;
const CROP_PER_INTER_OCULAR = 3.65 / HEAD_SHARE;
const HEAD_OVER_FACE = 1.45;
export const EYE_LINE = 0.52;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

interface Dimensions {
  readonly width: number;
  readonly height: number;
}

export function cropFromFace(face: FaceDetection, frame: Dimensions): CropBox | null {
  const { rightEye, leftEye } = face;
  const eyes = {
    x: ((rightEye.x + leftEye.x) / 2) * frame.width,
    y: ((rightEye.y + leftEye.y) / 2) * frame.height,
  };
  const apart = Math.hypot((rightEye.x - leftEye.x) * frame.width, (rightEye.y - leftEye.y) * frame.height);
  if (!Number.isFinite(apart) || apart < 2) return null;
  const shortest = Math.min(frame.width, frame.height);
  const fromEyes = apart * CROP_PER_INTER_OCULAR;
  const fromBox = (face.boxHeight * HEAD_OVER_FACE) / HEAD_SHARE;
  const size = Math.min(shortest, Math.max(fromEyes, fromBox));
  return {
    x: clamp(eyes.x - size / 2, 0, Math.max(0, frame.width - size)),
    y: clamp(eyes.y - size * EYE_LINE, 0, Math.max(0, frame.height - size)),
    size,
  };
}

/** The biggest face wins: in a group shot, the one whose photo this is. */
export function largestFace(faces: readonly FaceDetection[]): FaceDetection | null {
  return faces.reduce<FaceDetection | null>(
    (best, face) => (best === null || face.boxWidth > best.boxWidth ? face : best),
    null,
  );
}

/** Centred square fallback, used when no face is found. */
export function centreSquare(frame: Dimensions): CropBox {
  const size = Math.min(frame.width, frame.height);
  return { x: (frame.width - size) / 2, y: (frame.height - size) / 2, size };
}

function sampleIndex(box: CropBox, side: number, x: number, y: number, frame: Dimensions): number {
  const sx = Math.min(frame.width - 1, Math.floor(box.x + ((x + 0.5) * box.size) / side));
  const sy = Math.min(frame.height - 1, Math.floor(box.y + ((y + 0.5) * box.size) / side));
  return sy * frame.width + sx;
}

/** Nearest-sample resample of the crop square into a `side`×`side` image. */
export function cropImage(image: RgbaImage, box: CropBox, side: number): RgbaImage {
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const from = sampleIndex(box, side, x, y, image) * 4;
      data.set(image.data.subarray(from, from + 4), (y * side + x) * 4);
    }
  }
  return { width: side, height: side, data };
}

/** The same crop applied to a matte that may be at a different resolution than the photo. */
export function cropMatte(matte: AlphaMask, box: CropBox, side: number, frame: Dimensions): AlphaMask {
  const sx = matte.width / frame.width;
  const sy = matte.height / frame.height;
  const scaled = { x: box.x * sx, y: box.y * sy, size: box.size * Math.min(sx, sy) };
  const data = new Uint8ClampedArray(side * side);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) data[y * side + x] = matte.data[sampleIndex(scaled, side, x, y, matte)];
  }
  return { width: side, height: side, data };
}
