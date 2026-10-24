import type { AlphaMask, CropBox } from '../types';

/**
 * ADDENDUM-017 — turning a matte into a decision about every cell of the portrait.
 *
 * A segmentation model mattes any person-shaped thing in the frame, not "the one
 * subject". Photograph somebody in a hawker centre and the person at the next table is
 * matted too, arriving as a lump of subject floating in the backdrop with no path to the
 * face. A per-cell threshold cannot notice that, so connectivity is asked here: keep the
 * piece the face is in, drop the pieces that are nothing to do with it.
 */

/** The model's answer, reduced to the portrait grid: 1 means backdrop. */
export const DEFAULT_THRESHOLD = 128;

/**
 * Detached pieces of this many cells or fewer become backdrop. 0 keeps every piece.
 *
 * Measured across the recorded crowd of the source app, the largest detached piece was
 * 80 cells while the smallest main subject was 5788, so anything in ~100…5000 means
 * "keep the main piece only" in practice.
 */
export const DEFAULT_MIN_ISLAND = 512;

/** Cells to shrink (negative) or grow (positive) the subject by, −2…+2. */
export const DEFAULT_EDGE = 0;

/** The eye line of the portrait grid, and so the seed for the subject's piece. */
export const EYE_LINE = 0.52;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** How much of the photo behind one portrait cell the model called subject. */
function averageAlpha(
  matte: AlphaMask,
  fromX: number,
  fromY: number,
  cell: number,
  step: number
): number {
  let total = 0;
  let count = 0;
  for (let dy = 0; dy < cell; dy += step) {
    for (let dx = 0; dx < cell; dx += step) {
      const x = clamp(Math.round(fromX + dx), 0, matte.width - 1);
      const y = clamp(Math.round(fromY + dy), 0, matte.height - 1);
      total += matte.data[y * matte.width + x] ?? 0;
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

/**
 * The model's answer, reduced to the portrait grid: a cell is background when most of
 * the photo behind it was. Where the model has spoken there is nothing to guess at.
 */
export function backgroundFromMatte(
  matte: AlphaMask,
  crop: CropBox,
  size: number,
  threshold: number = DEFAULT_THRESHOLD
): Uint8Array {
  const background = new Uint8Array(size * size);
  const cell = crop.size / size;
  const step = Math.max(1, cell / 3);
  for (let at = 0; at < size * size; at += 1) {
    const fromX = crop.x + (at % size) * cell;
    const fromY = crop.y + Math.floor(at / size) * cell;
    background[at] = averageAlpha(matte, fromX, fromY, cell, step) < threshold ? 1 : 0;
  }
  return background;
}

function neighboursOf(cell: number, size: number): number[] {
  const x = cell % size;
  const y = (cell - x) / size;
  const found: number[] = [];
  if (x > 0) found.push(cell - 1);
  if (x < size - 1) found.push(cell + 1);
  if (y > 0) found.push(cell - size);
  if (y < size - 1) found.push(cell + size);
  return found;
}

/** Every 4-connected run of subject cells, as the cells that make it up. */
function componentsOf(background: Uint8Array, size: number): number[][] {
  const seen = new Uint8Array(background.length);
  const found: number[][] = [];
  for (let start = 0; start < background.length; start += 1) {
    if (seen[start] === 1 || background[start] === 1) continue;
    const stack = [start];
    const cells: number[] = [];
    seen[start] = 1;
    while (stack.length > 0) {
      const cell = stack.pop();
      if (cell === undefined) break;
      cells.push(cell);
      for (const neighbour of neighboursOf(cell, size)) {
        if (seen[neighbour] === 1 || background[neighbour] === 1) continue;
        seen[neighbour] = 1;
        stack.push(neighbour);
      }
    }
    found.push(cells);
  }
  return found;
}

/**
 * How many pieces the subject is in, largest first.
 *
 * Exported because "is this person in one piece?" is the question this whole module
 * exists to answer.
 */
export function componentSizes(background: Uint8Array, size: number): number[] {
  return componentsOf(background, size)
    .map((cells) => cells.length)
    .sort((first, second) => second - first);
}

/** Detached pieces of `minIsland` cells or fewer become backdrop. */
export function pruneIslands(background: Uint8Array, size: number, minIsland: number): Uint8Array {
  const output = Uint8Array.from(background);
  if (minIsland <= 0) return output;
  for (const cells of componentsOf(background, size)) {
    if (cells.length > minIsland) continue;
    for (const cell of cells) output[cell] = 1;
  }
  return output;
}

/** The biggest of the pieces, used when the seed does not land on any of them. */
function largestOf(components: readonly number[][]): number[] | undefined {
  return [...components].sort((left, right) => right.length - left.length)[0];
}

/**
 * Which piece is the person: the one the face is standing in.
 *
 * Every crop the pipeline produces is centred on the eye midpoint, so the cell at the
 * middle of the grid, 52 % of the way down, is between the eyes. That is the seed. When
 * the seed misses, the largest piece is kept instead — a hand-placed square can leave
 * the face anywhere inside it.
 */
export function keepSubjectPiece(
  background: Uint8Array,
  size: number,
  seedIndex: number
): Uint8Array {
  const output = Uint8Array.from(background);
  const seed = clamp(Math.round(seedIndex), 0, background.length - 1);
  const subject = componentsOf(background, size);
  const chosen = subject.find((cells) => cells.includes(seed)) ?? largestOf(subject);
  if (chosen === undefined) return output;
  const keep = new Set(chosen);
  for (const cells of subject) {
    if (keep.has(cells[0] ?? -1)) continue;
    for (const cell of cells) output[cell] = 1;
  }
  return output;
}

/**
 * Shrink or grow the subject by whole cells.
 *
 * A matte's edge is a guess, and which way it errs depends on the photograph: hair
 * against a dark café keeps a halo of café, a pale shirt against a pale wall loses its
 * shoulder. One cell either way is the difference, and it is cheaper to offer than to
 * model.
 */
export function trimEdge(background: Uint8Array, size: number, by: number): Uint8Array {
  const steps = Math.min(Math.abs(Math.round(by)), 2);
  if (steps === 0) return Uint8Array.from(background);
  // Growing the subject erodes the background and the reverse, so one loop serves both.
  const spreads = by < 0 ? 1 : 0;
  let current = Uint8Array.from(background);
  for (let pass = 0; pass < steps; pass += 1) {
    const source = current;
    const next = Uint8Array.from(source);
    for (let cell = 0; cell < source.length; cell += 1) {
      if (source[cell] !== spreads) continue;
      for (const neighbour of neighboursOf(cell, size)) next[neighbour] = spreads;
    }
    current = next;
  }
  return current;
}

/** The cell the face is standing in, on a grid of `size`. */
export function faceSeedIndex(size: number): number {
  const x = Math.floor(size / 2);
  const y = Math.min(size - 1, Math.round(size * EYE_LINE));
  return y * size + x;
}
