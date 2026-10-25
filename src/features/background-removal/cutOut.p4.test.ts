// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, componentSizesOf, pruneIslands, withBackground, withKnob, keepEverything } from './cutOut';
import { alphaOf } from './matte';
import { forgetSegmenter } from './segmentSubject';
import { subjectAlpha } from './subjectAlpha';

describe('cut-out grid', () => {
  it('clamps knobs to their bounds and never mutates', () => {
    const tuned = withKnob(DEFAULT_TUNING, { knob: 'edge', value: 9 });
    expect(tuned.edge).toBe(2);
    expect(withKnob(DEFAULT_TUNING, { knob: 'threshold', value: 3.6 }).threshold).toBe(16);
    // A knob that reports no number keeps its previous value instead of going NaN.
    expect(withKnob(DEFAULT_TUNING, { knob: 'threshold', value: Number.NaN }).threshold).toBe(DEFAULT_TUNING.threshold);
    expect(DEFAULT_TUNING.edge).toBe(0);
    expect(withBackground(DEFAULT_TUNING, { on: false }).removeBackground).toBe(false);
  });
});
describe('matte shapes and the segmenter loader', () => {
  afterEach(forgetSegmenter);

  it('rejects a plane with no pixels at all', () => {
    expect(alphaOf({ data: [], width: 0, height: 1 })).toBeNull();
    expect(alphaOf({ data: [], width: 1, height: 0 })).toBeNull();
    expect(alphaOf({ data: [1], width: 0.5, height: 2 })).toBeNull();
  });
});
describe('subjectAlpha from a non-square matte', () => {
  it('crops the matte to a square before gating it', () => {
    const matte = { width: 8, height: 4, data: new Uint8ClampedArray(32).fill(255) };
    const alpha = subjectAlpha({ matte, tuning: DEFAULT_TUNING, outSize: 8 });
    expect(alpha.width).toBe(8);
    expect(alpha.height).toBe(8);
    expect(alpha.data.every((value) => value === 255)).toBe(true);
  });

  it('takes a square matte as it is', () => {
    const matte = { width: 8, height: 8, data: new Uint8ClampedArray(64).fill(255) };
    expect(subjectAlpha({ matte, tuning: DEFAULT_TUNING, outSize: 8 }).data).toEqual(matte.data);
  });
});
describe('pruneIslands on a grid with no subject', () => {
  it('passes an empty grid through untouched', () => {
    expect(pruneIslands(new Uint8Array(0), 0, 3)).toEqual(new Uint8Array(0));
  });

  it('passes an all-background grid through untouched', () => {
    const grid = new Uint8Array(9).fill(1);
    expect(pruneIslands(grid, 3, 2)).toEqual(grid);
  });
});
describe('decision grid helpers', () => {
  it('keeps every cell, and lists the pieces largest first', () => {
    expect(Array.from(keepEverything(3))).toEqual(new Array(9).fill(0));
    // 1 is background, 0 is subject: a horizontal pair and a lone cell, apart.
    const grid = new Uint8Array(25).fill(1);
    grid[0] = 0;
    grid[1] = 0;
    grid[24] = 0;
    const sizes = componentSizesOf(grid, 5);
    expect(sizes[0]).toBeGreaterThanOrEqual(sizes[sizes.length - 1]);
    expect(sizes.length).toBeGreaterThan(1);
  });

  it('prunes nothing with a zero threshold and survives an empty subject', () => {
    const grid = new Uint8Array(9);
    grid[0] = 0;
    expect(Array.from(pruneIslands(grid, 3, 0))).toEqual(Array.from(grid));
    // Nothing to keep at all: the grid comes back untouched rather than throwing.
    expect(Array.from(pruneIslands(new Uint8Array(9), 3, 4))).toEqual(new Array(9).fill(0));
  });

  it('drops a stray island but keeps the piece under the face seed', () => {
    const grid = new Uint8Array(25).fill(1);
    // A single stray subject cell in the corner and a block in the middle (row 2, col 2).
    grid[0] = 0;
    const middle = 2 * 5 + 2;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) grid[middle + dy * 5 + dx] = 0;
    }
    const pruned = pruneIslands(grid, 5, 2);
    expect(pruned[0]).toBe(1); // the stray is gone
    expect(pruned[middle]).toBe(0); // the piece under the face seed stays
  });
});
