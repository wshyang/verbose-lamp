import type { CropBox, FaceReading, RgbaImage } from '../types';

/**
 * ADDENDUM-017 — where the face is, and where the portrait square should sit.
 *
 * Two answers, in order of trust. The detector's keypoints are measured from the eyes,
 * which is the steadiest scale in a photograph — unlike shoulder width it does not move
 * with clothing, posture or a raised arm. The skin-tone heuristic is the fallback for
 * the instant preview, before any model has been fetched: it is not a face detector and
 * never pretends to be, it is a guess with a known bias.
 */

/** The drawn portraits put the eyes 52 % down and give the head 72 % of the height. */
export const EYE_LINE = 0.52;
export const HEAD_SHARE = 0.72;
/** A detector box is the face; a head is about half as tall again. Used only as a floor. */
export const HEAD_OVER_FACE = 1.45;
/**
 * Crop size per unit of inter-ocular distance.
 *
 * Adult interpupillary distance is ~63 mm against a ~230 mm chin-to-crown head, so a head
 * is about 3.65 inter-ocular distances tall; `HEAD_SHARE` then gives the head 72 % of the
 * crop. Hence 3.65 / 0.72.
 */
export const CROP_PER_INTER_OCULAR = 3.65 / 0.72;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The crop, from the eye line.
 *
 * Inter-ocular distance sets the scale, but it shrinks as a head turns away, so the
 * detector's own box height is kept as a floor: a face in profile comes out framed a
 * little wide rather than cropped into.
 */
export function cropBoxFromFace(
  face: FaceReading,
  width: number,
  height: number
): CropBox | null {
  const [right, left] = face.keypoints;
  if (right === undefined || left === undefined) return null;

  const eyes = {
    x: ((right.x + left.x) / 2) * width,
    y: ((right.y + left.y) / 2) * height,
  };
  const apart = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
  if (!Number.isFinite(apart) || apart < 2) return null;

  // The crop is a SQUARE, so the ceiling is the shortest edge — not the longest.
  const shortest = Math.min(width, height);
  const fromEyes = apart * CROP_PER_INTER_OCULAR;
  const fromBox = ((face.box?.height ?? 0) * HEAD_OVER_FACE) / HEAD_SHARE;
  const size = Math.min(shortest, Math.max(fromEyes, fromBox));
  return {
    x: clamp(eyes.x - size / 2, 0, Math.max(0, width - size)),
    y: clamp(eyes.y - size * EYE_LINE, 0, Math.max(0, height - size)),
    size,
  };
}

interface Colour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * The classic RGB skin rule. It is not a face detector, but a passport photo is a face
 * on a plain ground, and the bounding box of "skin" is the face to within a few pixels.
 */
function isSkin({ r, g, b }: Colour): boolean {
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return r > 95 && g > 40 && b > 20 && spread > 15 && r > g && r > b && Math.abs(r - g) > 15;
}

interface SkinProfile {
  readonly rows: Map<number, { count: number; sumX: number }>;
  readonly step: number;
  readonly total: number;
}

function skinProfile(image: RgbaImage): SkinProfile {
  const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 200));
  const rows = new Map<number, { count: number; sumX: number }>();
  let total = 0;
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const offset = (y * image.width + x) * 4;
      const colour = { r: image.data[offset], g: image.data[offset + 1], b: image.data[offset + 2] };
      if (!isSkin(colour)) continue;
      const row = rows.get(y) ?? { count: 0, sumX: 0 };
      rows.set(y, { count: row.count + 1, sumX: row.sumX + x });
      total += 1;
    }
  }
  return { rows, step, total };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted[Math.floor(sorted.length / 2)];
  return middle ?? 0;
}

/**
 * The crop, from skin colour alone — the instant preview's guess.
 *
 * The head is measured across, not down: the widest band of skin is the cheekbones, and
 * a head is about 1.45 times as tall as it is wide. Measuring the skin box top to
 * bottom looks obvious and is wrong — an open collar puts the neck and the chest in the
 * box, the "face" comes out twice as tall as it is, and the crop slides down until the
 * crown is cut off.
 */
export function skinCropBox(image: RgbaImage): CropBox {
  const shortest = Math.min(image.width, image.height);
  const centred = {
    x: (image.width - shortest) / 2,
    y: (image.height - shortest) / 2,
    size: shortest,
  };
  const profile = skinProfile(image);
  // Too little skin to trust — an unlit photo, or not a face. Centre and hope.
  if (profile.total < 64) return centred;

  const ys = [...profile.rows.keys()].sort((left, right) => left - right);
  const top = ys[Math.floor(ys.length * 0.02)] ?? 0;
  const bottom = ys[Math.floor(ys.length * 0.98)] ?? 0;
  const head = [...profile.rows.entries()].filter(([y]) => y <= top + (bottom - top) * 0.55);
  const widest = Math.max(0, ...head.map(([, row]) => row.count));
  const cheekRows = head.filter(([, row]) => row.count >= widest * 0.85);
  const cheekY = median(cheekRows.map(([y]) => y));
  const centreX = median(cheekRows.map(([, row]) => row.sumX / row.count));

  const faceWidth = widest * profile.step;
  const headHeight = faceWidth * 1.8;
  const size = clamp(headHeight / HEAD_SHARE, shortest * 0.3, shortest);
  // The eyes sit a little above the cheekbones.
  const eyeY = cheekY - headHeight * 0.05;
  return {
    x: clamp(centreX - size / 2, 0, Math.max(0, image.width - size)),
    y: clamp(eyeY - size * EYE_LINE, 0, Math.max(0, image.height - size)),
    size,
  };
}
