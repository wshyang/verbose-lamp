import type { AlphaMask, SquareBox } from '@/shared/lib/raster';
import type { CutOutTuning, DecisionGrid, TuningKnob } from './types';

/**
 * Keep/remove decisions on a coarse grid, ported unchanged from the reference studio's
 * `cutOut.ts` (ADDENDUM-017 §2). The grid stays 128 so the reference's measurements still
 * hold: the largest stray piece it saw was 80 cells, the smallest real subject 5,788, so
 * `minIsland 512` drops strays (a second diner's head) without ever eating a person.
 */
export const DECISION_GRID = 128;
/** The seed cell sits between the eyes: half-way across, on the 52 % eye line. */
const SEED_ROW = 0.52;

export const DEFAULT_TUNING: CutOutTuning = Object.freeze({
  removeBackground: true,
  threshold: 128,
  minIsland: 512,
  edge: 0,
});

export const TUNING_BOUNDS = Object.freeze({
  threshold: { min: 16, max: 240 },
  minIsland: { min: 0, max: 512 },
  edge: { min: -2, max: 2 },
} as const);

export const CUT_OUT_STEPS = Object.freeze({
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
} as const);

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** One knob moved, rounded and clamped to its bounds; never mutates the input. */
export function withKnob(tuning: CutOutTuning, change: { knob: TuningKnob; value: number }): CutOutTuning {
  const bounds = TUNING_BOUNDS[change.knob];
  const value = Number.isFinite(change.value) ? Math.round(change.value) : tuning[change.knob];
  return { ...tuning, [change.knob]: clamp(value, bounds.min, bounds.max) };
}

export function withBackground(tuning: CutOutTuning, change: { on: boolean }): CutOutTuning {
  return { ...tuning, removeBackground: change.on };
}

/** A grid that keeps every cell. */
export function keepEverything(size: number): DecisionGrid {
  return new Uint8Array(size * size);
}

function averageAlpha(matte: AlphaMask, from: { x: number; y: number }, patch: { cell: number; step: number }): number {
  let total = 0;
  let count = 0;
  for (let dy = 0; dy < patch.cell; dy += patch.step) {
    for (let dx = 0; dx < patch.cell; dx += patch.step) {
      const x = clamp(Math.round(from.x + dx), 0, matte.width - 1);
      const y = clamp(Math.round(from.y + dy), 0, matte.height - 1);
      total += matte.data[y * matte.width + x];
      count += 1;
    }
  }
  return total / Math.max(1, count);
}

/** Background cells (1) where the matte's average alpha in the cell is below the threshold. */
export function gridFromMatte(matte: AlphaMask, options: { size: number; threshold: number; box?: SquareBox }): DecisionGrid {
  const { size, threshold } = options;
  const box = options.box ?? { x: 0, y: 0, size: Math.min(matte.width, matte.height) };
  const cell = box.size / size;
  const patch = { cell, step: Math.max(1, cell / 3) };
  const grid = new Uint8Array(size * size);
  for (let at = 0; at < grid.length; at += 1) {
    const from = { x: box.x + (at % size) * cell, y: box.y + Math.floor(at / size) * cell };
    grid[at] = averageAlpha(matte, from, patch) < threshold ? 1 : 0;
  }
  return grid;
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

/** Erode (by < 0) or grow (by > 0) the subject by up to two cells. */
export function trimEdge(grid: DecisionGrid, size: number, by: number): DecisionGrid {
  const steps = Math.min(Math.abs(Math.round(by)), 2);
  if (steps === 0) return Uint8Array.from(grid);
  const spreads = by < 0 ? 1 : 0;
  let current = Uint8Array.from(grid);
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
  readonly grid: DecisionGrid;
  readonly size: number;
  readonly seen: Uint8Array;
}

function fillFrom(start: number, walk: Walk): number[] {
  const { grid, size, seen } = walk;
  const stack = [start];
  const cells: number[] = [];
  seen[start] = 1;
  while (stack.length > 0) {
    const cell = stack.pop() as number;
    cells.push(cell);
    for (const neighbour of neighboursOf(cell, size)) {
      if (seen[neighbour] === 1 || grid[neighbour] === 1) continue;
      seen[neighbour] = 1;
      stack.push(neighbour);
    }
  }
  return cells;
}

function componentsOf(grid: DecisionGrid, size: number): number[][] {
  const seen = new Uint8Array(grid.length);
  const found: number[][] = [];
  for (let start = 0; start < grid.length; start += 1) {
    if (seen[start] === 1 || grid[start] === 1) continue;
    found.push(fillFrom(start, { grid, size, seen }));
  }
  return found;
}

/** Sizes of the connected subject pieces, largest first. */
export function componentSizesOf(grid: DecisionGrid, size: number): number[] {
  return componentsOf(grid, size)
    .map((cells) => cells.length)
    .sort((first, second) => second - first);
}

function mainComponent(components: number[][], size: number): number[] | null {
  const seed = Math.round(size * SEED_ROW) * size + Math.round(size / 2);
  const holding = components.find((cells) => cells.includes(seed));
  if (holding !== undefined) return holding;
  return components.reduce<number[] | null>((best, cells) => (best === null || cells.length > best.length ? cells : best), null);
}

/** Drop pieces of `minIsland` cells or fewer, except the one holding the face (or else the largest). */
export function pruneIslands(grid: DecisionGrid, size: number, minIsland: number): DecisionGrid {
  if (minIsland <= 0) return Uint8Array.from(grid);
  const components = componentsOf(grid, size);
  const main = mainComponent(components, size);
  if (main === null) return Uint8Array.from(grid);
  const pruned = Uint8Array.from(grid);
  for (const cells of components) {
    if (cells === main || cells.length > minIsland) continue;
    for (const cell of cells) pruned[cell] = 1;
  }
  return pruned;
}

/** Threshold has already happened in `gridFromMatte`; trim runs before prune, as in the reference. */
export function tunedGrid(grid: DecisionGrid, size: number, tuning: CutOutTuning): DecisionGrid {
  return pruneIslands(trimEdge(grid, size, tuning.edge), size, tuning.minIsland);
}
