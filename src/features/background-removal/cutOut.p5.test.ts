// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, componentSizesOf, pruneIslands, withKnob, keepEverything } from './cutOut';
import { alphaOf, planeOf } from './matte';
import { forgetSegmenter, segmentSubject, warmUpSegmenter } from './segmentSubject';
import { subjectAlpha } from './subjectAlpha';
import { buildHawkerFrame, buildHawkerMatte } from './fixtures';
import { type TransformersModule } from './types';

const SIZE_p5 = 16;
/** A 16-grid of background (1) with subject (0) rectangles painted in. */
function gridWith_p5(rects: { x: number; y: number; w: number; h: number }[]): Uint8Array {
  const grid = new Uint8Array(SIZE_p5 * SIZE_p5).fill(1);
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) for (let x = rect.x; x < rect.x + rect.w; x += 1) grid[y * SIZE_p5 + x] = 0;
  }
  return grid;
}
describe('cut-out grid edge cases', () => {
  it('keeps the current knob value for a non-finite change', () => {
    expect(withKnob(DEFAULT_TUNING, { knob: 'edge', value: Number.NaN }).edge).toBe(DEFAULT_TUNING.edge);
    expect(withKnob(DEFAULT_TUNING, { knob: 'threshold', value: Number.POSITIVE_INFINITY }).threshold)
      .toBe(DEFAULT_TUNING.threshold);
  });

  it('keepEverything marks every cell as subject', () => {
    const grid = keepEverything(4);
    expect(grid).toHaveLength(16);
    expect(grid.every((cell) => cell === 0)).toBe(true);
  });

  it('orders several component sizes largest first', () => {
    const scene = gridWith_p5([{ x: 0, y: 0, w: 2, h: 2 }, { x: 6, y: 6, w: 4, h: 4 }]);
    expect(componentSizesOf(scene, SIZE_p5)).toEqual([16, 4]);
  });

  it('copies the grid untouched when pruning is off or there is no subject', () => {
    const scene = gridWith_p5([{ x: 6, y: 6, w: 4, h: 4 }]);
    const off = pruneIslands(scene, SIZE_p5, 0);
    expect(off).toEqual(scene);
    expect(off).not.toBe(scene);
    const empty = gridWith_p5([]);
    expect(pruneIslands(empty, SIZE_p5, 8)).toEqual(empty);
  });
});
describe('matte rejection and segmenter warm-up', () => {
  afterEach(forgetSegmenter);

  const flush = () => new Promise((resolve) => setTimeout(resolve, 25)); // a cold import can outlast one tick
  const fakeModule = (result: unknown): TransformersModule => ({
    pipeline: async () => async () => result,
    RawImage: class { constructor(public data: Uint8ClampedArray) {} },
  });

  it('rejects non-objects, empty answers and impossible dimensions', () => {
    expect(planeOf(42)).toBeNull();
    expect(planeOf([])).toBeNull();
    expect(planeOf({})).toBeNull();
    expect(planeOf({ mask: null, data: [1], width: 1, height: 1 })).not.toBeNull();
    expect(alphaOf({ data: [], width: 0, height: 1 })).toBeNull();
    expect(alphaOf({ data: [1, 2], width: 1.5, height: 1 })).toBeNull();
  });

  it('returns null when the model answer is not a matte or the wrong size', async () => {
    const photo = buildHawkerFrame();
    expect(await segmentSubject(photo, async () => fakeModule(42))).toBeNull();
    forgetSegmenter();
    const tiny = { data: [255], width: 1, height: 1, channels: 1 };
    expect(await segmentSubject(photo, async () => fakeModule(tiny))).toBeNull();
  });

  it('warms up without poisoning later calls, and defaults never throw', async () => {
    const photo = buildHawkerFrame();
    const matte = buildHawkerMatte();
    const plane = { data: matte.data, width: matte.width, height: matte.height, channels: 1 };

    warmUpSegmenter(() => Promise.reject(new Error('CDN blocked')));
    await flush();
    expect((await segmentSubject(photo, async () => fakeModule(plane)))?.data).toEqual(matte.data);

    // A loader that fails the way an unreachable CDN does: deterministic, with no real network.
    const unreachable = () => Promise.reject(new Error('CDN unreachable'));
    forgetSegmenter();
    warmUpSegmenter(unreachable);
    await flush();
    expect((await segmentSubject(photo, async () => fakeModule(plane)))?.data).toEqual(matte.data);

    forgetSegmenter();
    await expect(segmentSubject(photo, unreachable)).resolves.toBeNull();
  });
});
describe('subjectAlpha size normalisation', () => {
  it('resamples a matte that is not already the output square', () => {
    const small = { width: 4, height: 4, data: new Uint8ClampedArray(16).fill(200) };
    const alpha = subjectAlpha({ matte: small, tuning: DEFAULT_TUNING, outSize: 8, grid: 2 });
    expect([alpha.width, alpha.height, alpha.data.length]).toEqual([8, 8, 64]);
    expect(alpha.data.every((value) => value === 200)).toBe(true);
  });
});
