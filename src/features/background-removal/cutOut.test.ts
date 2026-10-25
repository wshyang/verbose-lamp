import { afterEach, describe, expect, it } from 'vitest';
import { resampleAlpha } from '@/shared/lib/raster';
import {
  DEFAULT_TUNING,
  componentSizesOf,
  gridFromMatte,
  pruneIslands,
  trimEdge,
  tunedGrid,
  withBackground,
  withKnob,
} from './cutOut';
import { alphaOf, planeOf } from './matte';
import { forgetSegmenter, segmentSubject } from './segmentSubject';
import { subjectAlpha } from './subjectAlpha';
import { FACE_DISC, HAWKER_CROP, SECOND_HEAD, buildHawkerFrame, buildHawkerMatte } from './fixtures';
import type { TransformersModule } from './types';

const SIZE = 16;

/** A 16-grid of background (1) with subject (0) rectangles painted in. */
function gridWith(rects: { x: number; y: number; w: number; h: number }[]): Uint8Array {
  const grid = new Uint8Array(SIZE * SIZE).fill(1);
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) for (let x = rect.x; x < rect.x + rect.w; x += 1) grid[y * SIZE + x] = 0;
  }
  return grid;
}

const count = (grid: Uint8Array, value: number) => grid.filter((cell) => cell === value).length;

describe('cut-out grid', () => {
  it('marks cells below the threshold as background', () => {
    const matte = { width: 4, height: 4, data: Uint8ClampedArray.from([0, 0, 255, 255, 0, 0, 255, 255, 90, 90, 150, 150, 90, 90, 150, 150]) };
    expect(Array.from(gridFromMatte(matte, { size: 2, threshold: 128 }))).toEqual([1, 0, 1, 0]);
    expect(Array.from(gridFromMatte(matte, { size: 2, threshold: 80 }))).toEqual([1, 0, 0, 0]);
  });

  it('trims and grows the subject by whole cells', () => {
    const block = gridWith([{ x: 4, y: 4, w: 6, h: 6 }]);
    expect(count(trimEdge(block, SIZE, -1), 0)).toBe(16);
    expect(count(trimEdge(block, SIZE, 1), 0)).toBe(36 + 24);
    expect(count(trimEdge(block, SIZE, 0), 0)).toBe(36);
  });

  it('keeps the piece holding the seed and prunes small strays', () => {
    const scene = gridWith([{ x: 6, y: 6, w: 4, h: 4 }, { x: 0, y: 0, w: 2, h: 2 }]);
    const pruned = pruneIslands(scene, SIZE, 8);
    expect(componentSizesOf(pruned, SIZE)).toEqual([16]);
    expect(pruned[8 * SIZE + 8]).toBe(0);
  });

  it('falls back to the largest piece when nothing holds the seed', () => {
    const scene = gridWith([{ x: 0, y: 0, w: 3, h: 3 }, { x: 12, y: 12, w: 2, h: 2 }]);
    expect(componentSizesOf(pruneIslands(scene, SIZE, 20), SIZE)).toEqual([9]);
  });

  it('trims before pruning, so a bridge cut by the trim frees the stray', () => {
    const bridged = gridWith([{ x: 5, y: 5, w: 6, h: 6 }, { x: 11, y: 7, w: 3, h: 1 }, { x: 13, y: 6, w: 3, h: 3 }]);
    expect(componentSizesOf(tunedGrid(bridged, SIZE, { ...DEFAULT_TUNING, minIsland: 8 }), SIZE)).toHaveLength(1);
    const result = tunedGrid(bridged, SIZE, { ...DEFAULT_TUNING, edge: -1, minIsland: 8 });
    // 4×4 eroded core plus the one rim cell still braced by the bridge stub; the stray's
    // surviving centre cell is cut loose by the trim and then pruned.
    expect(componentSizesOf(result, SIZE)).toEqual([17]);
    expect(result[7 * SIZE + 14]).toBe(1);
  });

  it('clamps knobs to their bounds and never mutates', () => {
    const tuned = withKnob(DEFAULT_TUNING, { knob: 'edge', value: 9 });
    expect(tuned.edge).toBe(2);
    expect(withKnob(DEFAULT_TUNING, { knob: 'threshold', value: 3.6 }).threshold).toBe(16);
    expect(DEFAULT_TUNING.edge).toBe(0);
    expect(withBackground(DEFAULT_TUNING, { on: false }).removeBackground).toBe(false);
  });
});

describe('subjectAlpha on the hawker-centre fixture', () => {
  const cropped = resampleAlpha(buildHawkerMatte(), HAWKER_CROP, 64);
  const run = (tuning = DEFAULT_TUNING) => subjectAlpha({ matte: cropped, tuning, outSize: 64, grid: 16 });
  const at = (x: number, y: number) => Math.round(((y - HAWKER_CROP.y) / HAWKER_CROP.size) * 64) * 64 + Math.round(((x - HAWKER_CROP.x) / HAWKER_CROP.size) * 64);
  const total = (mask: { data: Uint8ClampedArray }) => mask.data.reduce((sum, value) => sum + value, 0);
  const tuning = { ...DEFAULT_TUNING, minIsland: 12 };

  it('drops the detached second head to alpha 0', () => {
    expect(cropped.data[at(SECOND_HEAD.x, SECOND_HEAD.y)]).toBe(255);
    expect(run(tuning).data[at(SECOND_HEAD.x, SECOND_HEAD.y)]).toBe(0);
  });

  it("keeps the matte's own alpha inside the subject", () => {
    const point = at(FACE_DISC.x + 9, FACE_DISC.y);
    expect(run(tuning).data[point]).toBe(cropped.data[point]);
    expect(run(tuning).data[at(FACE_DISC.x, FACE_DISC.y)]).toBe(255);
  });

  it('never grows the subject when the threshold rises', () => {
    const loose = run({ ...tuning, threshold: 80 });
    const tight = run({ ...tuning, threshold: 210 });
    expect(tight.data.every((value, pixel) => value <= loose.data[pixel])).toBe(true);
  });

  it('shrinks with edge −1 and grows with edge +1', () => {
    const base = total(run(tuning));
    expect(total(run({ ...tuning, edge: -1 }))).toBeLessThan(base);
    expect(total(run({ ...tuning, edge: 1 }))).toBeGreaterThan(base);
  });

  it('keeps everything when background removal is off', () => {
    expect(run({ ...tuning, removeBackground: false }).data.every((value) => value === 255)).toBe(true);
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
    expect(planeOf(null)).toBeNull();
    // An object that carries neither an alpha image nor a mask is not a matte.
    expect(planeOf({})).toBeNull();
    expect(planeOf([{ width: 2, height: 1 }])).toBeNull();
    // A plane with no pixels cannot be a matte either, whatever its buffer holds.
    expect(alphaOf({ data: [], width: 0, height: 1 })).toBeNull();
    expect(alphaOf({ data: [1], width: 1.5, height: 1 })).toBeNull();
  });

  it('returns the matte from a fake model, and null when loading fails', async () => {
    const photo = buildHawkerFrame();
    const matte = buildHawkerMatte();
    const fake: TransformersModule = {
      pipeline: async () => async () => ({ data: matte.data, width: matte.width, height: matte.height, channels: 1 }),
      RawImage: class { constructor(public data: Uint8ClampedArray) {} },
    };
    expect((await segmentSubject(photo, async () => fake))?.data).toEqual(matte.data);
    forgetSegmenter();
    expect(await segmentSubject(photo, () => Promise.reject(new Error('CDN blocked')))).toBeNull();
  });
});
