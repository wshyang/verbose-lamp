import { boxBlur, dilateAlpha, erodeAlpha, resampleAlpha, solidAlpha, type AlphaMask } from '@/shared/lib/raster';
import { DECISION_GRID, gridFromMatte, trimEdge, tunedGrid } from './cutOut';
import type { CutOutTuning, DecisionGrid, SubjectMatte } from './types';

/**
 * Full-resolution subject alpha (ADDENDUM-017 §3.2).
 *
 * Each pixel keeps the matte's own soft edge (hair, shoulders) but is gated by the tuned
 * 128 grid, so pruned strays vanish and the named steps behave as in the reference. The
 * gate is the grid scaled up and feathered by half a cell; the edge knob also erodes or
 * dilates the matte by whole cells so "Grow" can reveal more than the matte alone kept.
 */
export interface SubjectAlphaInput {
  /** The matte already cropped to the avatar square (any resolution). */
  readonly matte: SubjectMatte;
  readonly tuning: CutOutTuning;
  readonly outSize: number;
  readonly grid?: number;
}

interface GateInput {
  readonly tuned: DecisionGrid;
  readonly pruned: DecisionGrid;
  readonly size: number;
  readonly outSize: number;
}

function squareMatte(matte: SubjectMatte, outSize: number): AlphaMask {
  if (matte.width === outSize && matte.height === outSize) return matte;
  return resampleAlpha(matte, { x: 0, y: 0, size: Math.min(matte.width, matte.height) }, outSize);
}

/** Cells that were subject after trimming but were removed as strays. */
function prunedCells(trimmed: DecisionGrid, tuned: DecisionGrid): DecisionGrid {
  return Uint8Array.from(trimmed, (value, cell) => (value === 0 && tuned[cell] === 1 ? 1 : 0));
}

function gateFromGrid({ tuned, pruned, size, outSize }: GateInput): Float32Array {
  const cellPx = outSize / size;
  const cellOf = (pixel: number) => Math.min(size - 1, Math.floor((pixel % outSize) / cellPx))
    + Math.min(size - 1, Math.floor(Math.floor(pixel / outSize) / cellPx)) * size;
  const keep = Float32Array.from({ length: outSize * outSize }, (_, pixel) => (tuned[cellOf(pixel)] === 0 ? 1 : 0));
  const feathered = boxBlur(keep, { width: outSize, height: outSize, radius: Math.round(cellPx / 2) });
  return feathered.map((value, pixel) => (pruned[cellOf(pixel)] === 1 ? 0 : Math.min(1, Math.max(0, value))));
}

function edgedMatte(matte: AlphaMask, change: { edge: number; cellPx: number }): AlphaMask {
  const radius = Math.round(Math.abs(change.edge) * change.cellPx);
  if (change.edge > 0) return dilateAlpha(matte, radius);
  if (change.edge < 0) return erodeAlpha(matte, radius);
  return matte;
}

export function subjectAlpha(input: SubjectAlphaInput): AlphaMask {
  const { tuning, outSize } = input;
  if (!tuning.removeBackground) return solidAlpha(outSize);
  const size = input.grid ?? DECISION_GRID;
  const matte = squareMatte(input.matte, outSize);
  const raw = gridFromMatte(matte, { size, threshold: tuning.threshold });
  const tuned = tunedGrid(raw, size, tuning);
  const pruned = prunedCells(trimEdge(raw, size, tuning.edge), tuned);
  const gate = gateFromGrid({ tuned, pruned, size, outSize });
  const shaped = edgedMatte(matte, { edge: tuning.edge, cellPx: outSize / size });
  const data = Uint8ClampedArray.from(shaped.data, (value, pixel) => Math.round(value * gate[pixel]));
  return { width: outSize, height: outSize, data };
}
