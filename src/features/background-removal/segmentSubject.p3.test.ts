// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type RgbaImage } from '@/shared/lib/raster';

import { type TransformersModule } from './types';

import { SEGMENTATION_MODEL, TRANSFORMERS_URL, forgetSegmenter, loadTransformers, segmentSubject, warmUpSegmenter } from './segmentSubject';

const image: RgbaImage = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
function fakeModule(result: unknown): TransformersModule {
  return {
    pipeline: vi.fn(async () => vi.fn(async () => result)),
    RawImage: class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
        readonly channels: number,
      ) {}
    },
  } as unknown as TransformersModule;
}
const mask = {
  data: new Uint8ClampedArray([255, 128, 64, 0]),
  width: 2,
  height: 2,
  channels: 1,
};
afterEach(() => {
  forgetSegmenter();
  vi.clearAllMocks();
});
describe('segmentation constants', () => {
  it('pins the CDN build and the MODNet model', () => {
    expect(TRANSFORMERS_URL).toContain('@huggingface/transformers');
    expect(SEGMENTATION_MODEL).toBe('Xenova/modnet');
    expect(loadTransformers).toBeTypeOf('function');
  });
});
describe('segmentSubject', () => {
  it('returns the matte for the whole photo', async () => {
    const matte = await segmentSubject(image, async () => fakeModule({ mask }));
    expect(matte).toEqual({ width: 2, height: 2, data: mask.data });
  });

  it('accepts the pipeline result as an array', async () => {
    const matte = await segmentSubject(image, async () => fakeModule([{ mask }]));
    expect(matte?.data).toEqual(mask.data);
  });

  it('reuses the loaded model until it is forgotten', async () => {
    const load = vi.fn(async () => fakeModule({ mask }));
    await segmentSubject(image, load);
    await segmentSubject(image, load);
    expect(load).toHaveBeenCalledTimes(1);

    forgetSegmenter();
    await segmentSubject(image, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects a matte whose size does not match the photo', async () => {
    const wide = { data: new Uint8ClampedArray(4), width: 4, height: 1, channels: 1 };
    expect(await segmentSubject(image, async () => fakeModule({ mask: wide }))).toBeNull();
  });

  it('rejects a result with no recognisable plane', async () => {
    expect(await segmentSubject(image, async () => fakeModule(null))).toBeNull();
    forgetSegmenter();
    expect(await segmentSubject(image, async () => fakeModule({}))).toBeNull();
    forgetSegmenter();
    expect(
      await segmentSubject(image, async () => fakeModule({ mask: { ...mask, channels: 3 } })),
    ).toBeNull();
  });

  it('returns null when the model cannot be loaded and clears the cache', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await segmentSubject(image, failing)).toBeNull();

    const working = vi.fn(async () => fakeModule({ mask }));
    expect(await segmentSubject(image, working)).not.toBeNull();
    expect(working).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed warm-up so the next call tries again', async () => {
    const failing = vi.fn(async () => {
      throw new Error('nope');
    });
    warmUpSegmenter(failing);
    await vi.waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const working = vi.fn(async () => fakeModule({ mask }));
    expect(await segmentSubject(image, working)).not.toBeNull();
  });
});
describe('the CDN loader', () => {
  it('rejects honestly when the CDN cannot be reached in the sandbox', async () => {
    await expect(loadTransformers()).rejects.toBeTruthy();
  });
});
