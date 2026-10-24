import { required } from '../required.js';
import type { CropBox, SubjectMask } from './types.js';

/**
 * ADR-072 — turning a matte into a decision about every sprite cell, with the three numbers that
 * decision actually rests on exposed instead of hardcoded.
 *
 * The old code was one line (`averageAlpha(…) < 128`) and could not see shape. MODNET is a
 * *portrait* matting model: it mattes any person-shaped thing in the frame, not "the one subject".
 * Photograph somebody in a hawker centre and the person at the next table is matted too, arriving
 * as a lump of subject floating in the backdrop with no path to the face. A per-cell threshold
 * cannot notice that, and `despeckle` in `photoSprite.ts` only rewrites cells matching none of
 * their four neighbours — so an eighty-cell blob beside somebody's head survived both.
 *
 * Connectivity is the missing question, and it is asked here: keep the piece the face is in, drop
 * the pieces that are nothing to do with it.
 */

export interface CutOutTuning {
  /**
   * ADR-077 — whether to cut the background out at all.
   *
   * Some photographs defeat every setting below. A crowd directly behind the subject, a wall the
   * same colour as a shirt, a matte that decides an arm is background: at that point the honest
   * answer is to stop cutting and keep the photograph. False means the sprite is the whole crop,
   * backdrop and all, and the three numbers below stop meaning anything.
   */
  removeBackground: boolean;
  /**
   * How much of the photo behind a cell must read as subject for the cell to be kept, 1–254.
   * Higher cuts tighter. Only meaningful on the model path — the colour cut-out has no alpha.
   */
  threshold: number;
  /**
   * Detached pieces of this many cells or fewer become backdrop. 0 keeps every piece.
   *
   * The default is deliberately far above any real stray: measured across the recorded demo crowd,
   * the largest detached piece is 80 cells while the smallest main subject is 5788, so anything in
   * ~100…5000 means "keep the main piece only" in practice. 512 sits ~4× clear of the largest
   * observed stray and still only ~3 % of the grid.
   */
  minIsland: number;
  /** Cells to shrink (negative) or grow (positive) the subject by, −2…+2. */
  edge: number;
}

export const DEFAULT_TUNING: CutOutTuning = {
  removeBackground: true,
  threshold: 128,
  minIsland: 512,
  edge: 0,
};

/** ADR-077 — the cut-out turned on or off, as a new tuning. */
export function withBackground(tuning: CutOutTuning, change: { on: boolean }): CutOutTuning {
  return { ...tuning, removeBackground: change.on };
}

/**
 * Every cell is the person: what the mask looks like when the participant has turned the cut-out off.
 *
 * Zero means subject throughout, which is all the rest of the pipeline needs to be told. The palette
 * is then derived from the whole crop, no cell is repainted as backdrop, and the ink contour draws
 * nowhere because it only inks backdrop that touches subject — so "off" costs a branch rather than a
 * second code path.
 */
export function keepEverything(size: number): Uint8Array {
  return new Uint8Array(size * size);
}

/** The bounds the sliders travel between; the coarse steps below are points inside them. */
export const TUNING_BOUNDS = {
  threshold: { min: 16, max: 240 },
  minIsland: { min: 0, max: 512 },
  edge: { min: -2, max: 2 },
} as const;

/**
 * The coarse choices, in the participant's words rather than the pipeline's.
 *
 * Three named steps beat a slider on a beach: one tap, a thumb-sized target, and a label that says
 * what it does instead of what it sets. The sliders behind "Fine tune" reach the same three numbers
 * for anyone who wants them.
 */
export const CUT_OUT_STEPS = {
  threshold: [
    { label: 'Loose', value: 80 },
    { label: 'Normal', value: 128 },
    { label: 'Tight', value: 176 },
  ],
  minIsland: [
    { label: 'Keep', value: 0 },
    { label: 'Remove', value: 512 },
  ],
  edge: [
    { label: 'Trim', value: -1 },
    { label: 'As-is', value: 0 },
    { label: 'Grow', value: 1 },
  ],
} as const;

/**
 * The knobs that hold a number, which is not every field of a tuning: `removeBackground` is a
 * choice about whether the others apply at all, so it has its own setter rather than sharing theirs.
 * Derived from the bounds table so a knob cannot be added in one place and forgotten in the other.
 */
export type TuningKnob = keyof typeof TUNING_BOUNDS;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** One knob moved, within its own bounds, as a new tuning. */
export function withKnob(
  tuning: CutOutTuning,
  change: { knob: TuningKnob; value: number },
): CutOutTuning {
  const bounds = TUNING_BOUNDS[change.knob];
  return { ...tuning, [change.knob]: clamp(Math.round(change.value), bounds.min, bounds.max) };
}

/**
 * The model's answer, reduced to the sprite grid: a cell is background when most of the photo
 * behind it was. Where the model has spoken there is nothing to guess at, so the colour rules are
 * skipped entirely.
 */
export function maskFromModel(
  subject: SubjectMask,
  box: CropBox,
  grid: { size: number; threshold: number },
): Uint8Array {
  const { size, threshold } = grid;
  const background = new Uint8Array(size * size);
  const cell = box.size / size;
  const step = Math.max(1, cell / 3);
  for (let at = 0; at < size * size; at += 1) {
    const from = { x: box.x + (at % size) * cell, y: box.y + Math.floor(at / size) * cell };
    background[at] = averageAlpha(subject, from, { cell, step }) < threshold ? 1 : 0;
  }
  return background;
}

/** How much of the photo behind one sprite cell the model called subject. */
function averageAlpha(
  subject: SubjectMask,
  from: { x: number; y: number },
  patch: { cell: number; step: number },
): number {
  let total = 0;
  let count = 0;
  for (let dy = 0; dy < patch.cell; dy += patch.step) {
    for (let dx = 0; dx < patch.cell; dx += patch.step) {
      const x = clamp(Math.round(from.x + dx), 0, subject.width - 1);
      const y = clamp(Math.round(from.y + dy), 0, subject.height - 1);
      total += required(subject.alpha[y * subject.width + x], 'mask pixel');
      count += 1;
    }
  }
  return total / count;
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

/**
 * Shrink or grow the subject by whole cells.
 *
 * A matte's edge is a guess, and which way it errs depends on the photograph: hair against a dark
 * café keeps a halo of café, a pale shirt against a pale wall loses its shoulder. One cell either
 * way is the difference, and it is cheaper to offer than to model.
 */
export function trimEdge(background: Uint8Array, size: number, by: number): Uint8Array {
  const steps = Math.min(Math.abs(Math.round(by)), 2);
  if (steps === 0) return Uint8Array.from(background);
  // Growing the subject is eroding the background and the reverse, so one loop serves both: the
  // value that spreads into its neighbours is 1 (background) to trim, 0 (subject) to grow.
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

interface Walk {
  background: Uint8Array;
  size: number;
  /** Marked as the walk goes, so each cell joins exactly one piece. */
  seen: Uint8Array;
}

/** One piece, walked outward from a cell already known to be subject. */
function fillFrom(start: number, walk: Walk): number[] {
  const { background, size, seen } = walk;
  const stack = [start];
  const cells: number[] = [];
  seen[start] = 1;
  while (stack.length > 0) {
    const cell = required(stack.pop(), 'flood-fill cell');
    cells.push(cell);
    for (const neighbour of neighboursOf(cell, size)) {
      if (seen[neighbour] === 1 || background[neighbour] === 1) continue;
      seen[neighbour] = 1;
      stack.push(neighbour);
    }
  }
  return cells;
}

/** Every 4-connected run of subject cells, as the cells that make it up. */
function componentsOf(background: Uint8Array, size: number): number[][] {
  const seen = new Uint8Array(background.length);
  const found: number[][] = [];
  for (let start = 0; start < background.length; start += 1) {
    if (seen[start] === 1 || background[start] === 1) continue;
    found.push(fillFrom(start, { background, size, seen }));
  }
  return found;
}

/**
 * How many pieces the subject is in, largest first.
 *
 * Exported because "is this person in one piece?" is the question this whole module exists to
 * answer, and both the recorded-crowd regression and the end-to-end suite need to ask it of a
 * sprite rather than re-implement the walk.
 */
export function componentSizesOf(background: Uint8Array, size: number): number[] {
  return componentsOf(background, size)
    .map((cells) => cells.length)
    .sort((first, second) => second - first);
}

/**
 * Which piece is the person: the one the face is standing in.
 *
 * Every crop the pipeline produces is centred on the eye midpoint — `locateFace` builds it that
 * way — so the cell at the middle of the grid, 52 % of the way down, is between the eyes. That is
 * the seed.
 *
 * It can miss, and it does: a participant who placed the square by hand can leave their face
 * anywhere inside it, and one face in the recorded crowd has ink at that cell rather than subject.
 * Falling back to the largest piece matters more than it sounds — without it, that avatar comes out
 * blank.
 */
function mainComponent(components: number[][], size: number): number[] | null {
  const seed = Math.round(size * 0.52) * size + Math.round(size / 2);
  const holding = components.find((cells) => cells.includes(seed));
  if (holding !== undefined) return holding;
  return components.reduce<number[] | null>(
    (best, cells) => (best === null || cells.length > best.length ? cells : best),
    null,
  );
}

/** Pieces of subject with no path to the face, painted out. */
export function pruneIslands(background: Uint8Array, size: number, minIsland: number): Uint8Array {
  if (minIsland <= 0) return Uint8Array.from(background);
  const components = componentsOf(background, size);
  const main = mainComponent(components, size);
  if (main === null) return Uint8Array.from(background);
  const pruned = Uint8Array.from(background);
  for (const cells of components) {
    if (cells === main || cells.length > minIsland) continue;
    for (const cell of cells) pruned[cell] = 1;
  }
  return pruned;
}

/**
 * The whole tuned decision, in the one order that is defensible.
 *
 * Trim before prune, because eroding can *split* a subject and the new offcuts deserve the same
 * judgement as the old ones; prune before trim would hand erosion a clean grid and then never look
 * again. The threshold comes first of all, in `maskFromModel`, because it is what decides who the
 * candidates are.
 */
export function tunedMask(background: Uint8Array, size: number, tuning: CutOutTuning): Uint8Array {
  return pruneIslands(trimEdge(background, size, tuning.edge), size, tuning.minIsland);
}
