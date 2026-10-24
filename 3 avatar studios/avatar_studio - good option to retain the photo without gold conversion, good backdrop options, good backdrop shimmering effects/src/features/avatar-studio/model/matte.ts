import { boxBlur } from '@/features/gilded-portrait';
import type { AlphaMask, MatteTuning } from './types';

/**
 * Background removal decisions, ported from the reference app's `segmentPhoto.ts`
 * (plane reading) and `cutOut.ts` (threshold → keep the face's piece → edge).
 *
 * A portrait matting model mattes *every* person-shaped thing in frame; the
 * connectivity step keeps only the piece that contains the face seed, so the
 * stranger at the next table does not float in the gold backdrop.
 */

export const DEFAULT_MATTE_TUNING: MatteTuning = Object.freeze({
  isBackgroundRemoved: true,
  threshold: 128,
  edge: 0,
  feather: 1,
});

/** What segmentation libraries hand back: a single plane, optionally RGBA. */
export interface PixelPlane {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly channels?: number;
}

/** Find the matte plane in either `background-removal` or `image-segmentation` shapes. */
export function planeOf(result: unknown): PixelPlane | null {
  const answer = Array.isArray(result) ? result[0] : result;
  if (answer === null || typeof answer !== 'object') return null;
  const candidate = answer as { mask?: unknown; data?: unknown };
  if (candidate.mask !== null && typeof candidate.mask === 'object') return candidate.mask as PixelPlane;
  return candidate.data !== undefined ? (answer as PixelPlane) : null;
}

/** One byte of subject-ness per pixel; RGBA planes carry it in alpha. */
export function alphaOf(plane: PixelPlane): AlphaMask | null {
  const { width, height } = plane;
  const channels = plane.channels ?? 1;
  if (plane.data.length !== width * height * channels) return null;
  if (channels !== 1 && channels !== 4) return null;
  const data = new Uint8ClampedArray(width * height);
  for (let at = 0; at < data.length; at += 1) data[at] = Number(plane.data[at * channels + channels - 1]);
  return { width, height, data };
}

function binarise(matte: AlphaMask, threshold: number): Uint8Array {
  return Uint8Array.from(matte.data, (value) => (value >= threshold ? 1 : 0));
}

/** Label 4-connected subject pieces; returns labels (0 = background) and piece sizes. */
export function labelPieces(bits: Uint8Array, width: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(bits.length);
  const sizes = [0];
  const stack: number[] = [];
  for (let start = 0; start < bits.length; start += 1) {
    if (bits[start] === 0 || labels[start] !== 0) continue;
    const label = sizes.length;
    sizes.push(0);
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const at = stack.pop() as number;
      sizes[label] += 1;
      const x = at % width;
      const neighbours = [x > 0 ? at - 1 : -1, x < width - 1 ? at + 1 : -1, at - width, at + width];
      for (const next of neighbours) {
        if (next < 0 || next >= bits.length || bits[next] === 0 || labels[next] !== 0) continue;
        labels[next] = label;
        stack.push(next);
      }
    }
  }
  return { labels, sizes };
}

/** Which piece to keep: the one under the seed, else the largest. */
function chosenLabel(labels: Int32Array, sizes: readonly number[], seedIndex: number | null): number {
  if (seedIndex !== null && labels[seedIndex] > 0) return labels[seedIndex];
  return sizes.reduce((best, size, label) => (label > 0 && size > sizes[best] ? label : best), 0);
}

/** Keep only the piece containing the seed (normalised 0-1 point); drop detached islands. */
export function keepSeedPiece(bits: Uint8Array, width: number, seed: { x: number; y: number } | null): Uint8Array {
  const height = bits.length / width;
  const { labels, sizes } = labelPieces(bits, width);
  const seedIndex = seed === null
    ? null
    : Math.min(height - 1, Math.floor(seed.y * height)) * width + Math.min(width - 1, Math.floor(seed.x * width));
  const keep = chosenLabel(labels, sizes, seedIndex);
  return Uint8Array.from(labels, (label) => (keep > 0 && label === keep ? 1 : 0));
}

/** One step of 4-neighbour dilation (grow) or erosion (shrink). */
function morphStep(bits: Uint8Array, width: number, isGrow: boolean): Uint8Array {
  const target = isGrow ? 1 : 0;
  return bits.map((value, at) => {
    if (value === target) return value;
    const x = at % width;
    const touches = (x > 0 && bits[at - 1] === target) || (x < width - 1 && bits[at + 1] === target)
      || bits[at - width] === target || bits[at + width] === target;
    return touches ? target : value;
  });
}

export function shiftEdge(bits: Uint8Array, width: number, edge: number): Uint8Array {
  let result = bits;
  for (let step = 0; step < Math.abs(Math.round(edge)); step += 1) result = morphStep(result, width, edge > 0);
  return result;
}

/** Threshold → keep face piece → edge → feather. Off means "everything is subject". */
export function refineMatte(matte: AlphaMask, tuning: MatteTuning, seed: { x: number; y: number } | null): AlphaMask {
  const { width, height } = matte;
  if (!tuning.isBackgroundRemoved) return { width, height, data: new Uint8ClampedArray(width * height).fill(255) };
  const kept = shiftEdge(keepSeedPiece(binarise(matte, tuning.threshold), width, seed), width, tuning.edge);
  const soft = boxBlur(Float32Array.from(kept), { width, height, radius: tuning.feather });
  return { width, height, data: Uint8ClampedArray.from(soft, (value) => Math.round(value * 255)) };
}
