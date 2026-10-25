// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it } from 'vitest';
import { resampleAlpha } from '@/shared/lib/raster';
import { DEFAULT_TUNING, componentSizesOf, pruneIslands, withKnob, keepEverything } from './cutOut';
import { alphaOf, planeOf } from './matte';
import { forgetSegmenter } from './segmentSubject';
import { subjectAlpha } from './subjectAlpha';
import { HAWKER_CROP, buildHawkerMatte } from './fixtures';

const SIZE_p3 = 16;
/** A 16-grid of background (1) with subject (0) rectangles painted in. */
function gridWith_p3(rects: { x: number; y: number; w: number; h: number }[]): Uint8Array {
  const grid = new Uint8Array(SIZE_p3 * SIZE_p3).fill(1);
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) for (let x = rect.x; x < rect.x + rect.w; x += 1) grid[y * SIZE_p3 + x] = 0;
  }
  return grid;
}
describe('cut-out grid', () => {
  it('keeps the current knob when the new value is not a number', () => {
    expect(withKnob(DEFAULT_TUNING, { knob: 'edge', value: Number.NaN }).edge).toBe(DEFAULT_TUNING.edge);
    expect(withKnob(DEFAULT_TUNING, { knob: 'threshold', value: Number.POSITIVE_INFINITY }).threshold).toBe(
      DEFAULT_TUNING.threshold,
    );
  });

  it('orders several loose islands largest first', () => {
    const scene = gridWith_p3([
      { x: 1, y: 1, w: 2, h: 2 },
      { x: 8, y: 1, w: 4, h: 4 },
      { x: 1, y: 10, w: 3, h: 3 },
    ]);
    expect(componentSizesOf(scene, SIZE_p3)).toEqual([16, 9, 4]);
  });
});
describe('subjectAlpha on the hawker-centre fixture', () => {
  const cropped = resampleAlpha(buildHawkerMatte(), HAWKER_CROP, 64);

  it('accepts a matte that is already the output size', () => {
    const alpha = subjectAlpha({ matte: cropped, tuning: DEFAULT_TUNING, outSize: 64, grid: 16 });
    expect(alpha.width).toBe(64);
    expect(alpha.data.length).toBe(64 * 64);
  });

  it('downsamples a matte that is larger than the output', () => {
    const alpha = subjectAlpha({ matte: cropped, tuning: DEFAULT_TUNING, outSize: 32, grid: 16 });
    expect(alpha.width).toBe(32);
    expect(alpha.height).toBe(32);
    expect(alpha.data.length).toBe(32 * 32);
    expect(alpha.data.some((value) => value > 0)).toBe(true);
  });
});
describe('matte shapes and the segmenter loader', () => {
  afterEach(forgetSegmenter);

  it('reads both result shapes and rejects channel mismatches', () => {
    const rgba = { data: Uint8ClampedArray.from([9, 9, 9, 10, 9, 9, 9, 250]), width: 2, height: 1, channels: 4 };
    expect(Array.from(alphaOf(planeOf(rgba)!)!.data)).toEqual([10, 250]);
    expect(Array.from(alphaOf(planeOf([{ mask: { data: [5, 6], width: 2, height: 1, channels: 1 } }])!)!.data)).toEqual([5, 6]);
    expect(alphaOf({ data: [1, 2, 3, 4, 5, 6], width: 2, height: 1, channels: 3 })).toBeNull();
    expect(alphaOf({ data: [1, 2, 3], width: 2, height: 1 })).toBeNull();
    expect(alphaOf({ data: [1, 2], width: 0, height: 1 })).toBeNull();
    expect(alphaOf({ data: [1, 2], width: 1.5, height: 1 })).toBeNull();
    expect(planeOf(null)).toBeNull();
  });
});
describe('grid helpers for an untouched photo', () => {
  it('keeps every cell of an empty decision grid', () => {
    const grid = keepEverything(4);
    expect(grid).toHaveLength(16);
    expect(Array.from(grid).every((cell) => cell === 0)).toBe(true);
  });

  it('prunes a stray island that does not hold the face', () => {
    const size = 16;
    const grid = keepEverything(size);
    const seedRow = Math.round(size * 0.52);
    for (let x = 0; x < size; x += 1) grid[seedRow * size + x] = 0;
    grid[0] = 1;
    const pruned = pruneIslands(grid, size, 1);
    expect(pruned[0]).toBe(1);
  });

  it('keeps the largest island when the face cell is not held', () => {
    const size = 16;
    const grid = new Uint8Array(size * size).fill(1);
    for (const cell of [0, 17, 34, 51]) grid[cell] = 0;
    for (let x = 0; x < 6; x += 1) grid[200 + x] = 0;
    const pruned = pruneIslands(grid, size, 2);
    const subject = pruned.filter((cell) => cell === 0).length;
    expect(subject).toBe(6);
  });

  it('leaves the grid alone when island pruning is off or nothing is subject', () => {
    const size = 8;
    const grid = keepEverything(size);
    expect(pruneIslands(grid, size, 0)).toEqual(grid);
    const allBackground = new Uint8Array(size * size).fill(1);
    expect(pruneIslands(allBackground, size, 2)).toEqual(allBackground);
  });
});
