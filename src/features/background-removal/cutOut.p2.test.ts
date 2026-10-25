// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, componentSizesOf, pruneIslands, withKnob, keepEverything } from './cutOut';
import { alphaOf, planeOf } from './matte';
import { forgetSegmenter, segmentSubject, loadTransformers, warmUpSegmenter } from './segmentSubject';
import { subjectAlpha } from './subjectAlpha';
import { buildHawkerFrame } from './fixtures';
import { type TransformersModule } from './types';

const SIZE_p2 = 16;
/** A 16-grid of background (1) with subject (0) rectangles painted in. */
function gridWith_p2(rects: { x: number; y: number; w: number; h: number }[]): Uint8Array {
  const grid = new Uint8Array(SIZE_p2 * SIZE_p2).fill(1);
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) for (let x = rect.x; x < rect.x + rect.w; x += 1) grid[y * SIZE_p2 + x] = 0;
  }
  return grid;
}
describe('cut-out grid', () => {
  it('keeps the old knob for non-finite input, keeps everything, and sorts components', () => {
    expect(withKnob(DEFAULT_TUNING, { knob: 'edge', value: Number.NaN }).edge).toBe(DEFAULT_TUNING.edge);
    expect(withKnob(DEFAULT_TUNING, { knob: 'edge', value: Number.POSITIVE_INFINITY }).edge).toBe(DEFAULT_TUNING.edge);
    expect(Array.from(keepEverything(3))).toEqual(Array(9).fill(0));
    const scene = gridWith_p2([{ x: 0, y: 0, w: 2, h: 2 }, { x: 8, y: 8, w: 3, h: 3 }]);
    expect(componentSizesOf(scene, SIZE_p2)).toEqual([9, 4]);
    expect(pruneIslands(scene, SIZE_p2, 0)).toEqual(scene);
    const allBackground = new Uint8Array(SIZE_p2 * SIZE_p2).fill(1);
    expect(pruneIslands(allBackground, SIZE_p2, 4)).toEqual(allBackground);
  });
});
describe('subjectAlpha on the hawker-centre fixture', () => {
  const tuning = { ...DEFAULT_TUNING, minIsland: 12 };

  it('resamples a matte that is not already the output square', () => {
    const small = { width: 16, height: 16, data: new Uint8ClampedArray(256).fill(255) };
    const alpha = subjectAlpha({ matte: small, tuning, outSize: 32, grid: 8 });
    expect([alpha.width, alpha.height, alpha.data.length]).toEqual([32, 32, 1024]);
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
    expect(planeOf({})).toBeNull();
    expect(alphaOf({ data: [1], width: 0.5, height: 1 })).toBeNull();
    expect(alphaOf({ data: [1], width: 1, height: 0 })).toBeNull();
  });

  it('rejects unusable and wrongly-sized model planes', async () => {
    const photo = buildHawkerFrame();
    const moduleWith = (result: unknown): TransformersModule => ({
      pipeline: async () => async () => result,
      RawImage: class { constructor(public data: Uint8ClampedArray) {} },
    });
    expect(await segmentSubject(photo, async () => moduleWith(null))).toBeNull();
    forgetSegmenter();
    expect(await segmentSubject(photo, async () => moduleWith({
      data: new Uint8ClampedArray(4), width: 2, height: 2, channels: 1,
    }))).toBeNull();
  });

  it('warms up with custom/default loaders and clears failures', async () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    warmUpSegmenter(() => Promise.reject(new Error('offline')));
    await flush();
    let calls = 0;
    warmUpSegmenter(async () => {
      calls += 1;
      return {
        pipeline: async () => async () => null,
        RawImage: class { constructor(public data: Uint8ClampedArray) {} },
      } as unknown as TransformersModule;
    });
    await flush();
    expect(calls).toBe(1);
    forgetSegmenter();
    await expect(loadTransformers()).rejects.toBeDefined();
    forgetSegmenter();
    expect(() => warmUpSegmenter()).not.toThrow();
    await flush();
  });
});
