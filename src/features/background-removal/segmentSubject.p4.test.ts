// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { type RgbaImage } from '@/shared/lib/raster';

import { type TransformersModule } from './types';

import { SEGMENTATION_MODEL, forgetSegmenter, segmentSubject, warmUpSegmenter } from './segmentSubject';

const IMAGE: RgbaImage = { width: 4, height: 3, data: new Uint8ClampedArray(4 * 3 * 4) };
function makeLoader(answer: unknown) {
  const run = vi.fn(async () => answer);
  const pipeline = vi.fn(async () => run);
  const module = {
    pipeline,
    RawImage: class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
        readonly channels: number
      ) {}
    },
  } as unknown as TransformersModule;
  const load = vi.fn(async () => module);
  return { load, module, pipeline, run };
}
const PLANE = { data: new Uint8ClampedArray(4 * 3), width: 4, height: 3 };
describe('segmentSubject', () => {
  beforeEach(() => {
    forgetSegmenter();
  });

  it('asks for MODNet on WebAssembly and returns the matte', async () => {
    const { load, pipeline, run } = makeLoader(PLANE);
    const matte = await segmentSubject(IMAGE, load);

    expect(pipeline).toHaveBeenCalledWith('background-removal', SEGMENTATION_MODEL, { device: 'wasm' });
    expect(run).toHaveBeenCalledOnce();
    expect(matte).toEqual({ width: 4, height: 3, data: PLANE.data });
  });

  it('wraps the pixels back into the model’s own image type', async () => {
    const { load, run } = makeLoader(PLANE);
    await segmentSubject(IMAGE, load);
    const [input] = run.mock.calls[0] as unknown as [{ width: number; height: number; channels: number }];
    expect(input).toMatchObject({ width: 4, height: 3, channels: 4 });
  });

  it('accepts the list shape the segmentation pipelines also return', async () => {
    const { load } = makeLoader([{ mask: PLANE }]);
    expect(await segmentSubject(IMAGE, load)).not.toBeNull();
  });

  it('rejects a matte that does not match the photo', async () => {
    const { load } = makeLoader({ ...PLANE, width: 9 });
    expect(await segmentSubject(IMAGE, load)).toBeNull();
  });

  it('never throws, and clears the cache so a retry reloads', async () => {
    const { load, run } = makeLoader(PLANE);
    run.mockRejectedValueOnce(new Error('tensor'));
    expect(await segmentSubject(IMAGE, load)).toBeNull();

    const again = makeLoader(PLANE);
    expect(await segmentSubject(IMAGE, again.load)).not.toBeNull();
    expect(again.load).toHaveBeenCalledOnce();
  });
});
describe('warmUpSegmenter', () => {
  beforeEach(() => {
    forgetSegmenter();
  });

  it('shares the warm-up with the next call', async () => {
    const { load } = makeLoader(PLANE);
    warmUpSegmenter(load);
    await segmentSubject(IMAGE, load);
    expect(load).toHaveBeenCalledOnce();
  });

  it('swallows a failed warm-up so the next call retries', async () => {
    const failing = vi.fn(async () => Promise.reject(new Error('offline')));
    warmUpSegmenter(failing);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const { load } = makeLoader(PLANE);
    expect(await segmentSubject(IMAGE, load)).not.toBeNull();
    expect(failing).toHaveBeenCalledOnce();
  });
});
