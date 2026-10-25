// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { type RgbaImage } from '@/shared/lib/raster';

import { type FaceDetection, type TasksVisionModule } from './types';

import { MIN_CONFIDENCE, MODEL_URL, canvasSourceOf, forgetFaceLocator, locateFace, warmUpFaceLocator } from './locateFace';

const IMAGE: RgbaImage = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
/** Two eyes 40 % of the frame apart, centred — a crop must come back. */
const FACE_p4: FaceDetection = {
  boundingBox: { originX: 0.3, originY: 0.2, width: 0.4, height: 0.5 },
  keypoints: [
    { x: 0.3, y: 0.4 },
    { x: 0.7, y: 0.4 },
  ],
};
function makeLoader(detections: FaceDetection[] | undefined) {
  const detect = vi.fn(() => ({ detections }));
  const createFromOptions = vi.fn(async () => ({ detect }));
  const module = {
    FilesetResolver: { forVisionTasks: vi.fn(async () => ({ wasm: 'fileset' })) },
    FaceDetector: { createFromOptions },
  } as unknown as TasksVisionModule;
  const load = vi.fn(async () => module);
  return { load, module, createFromOptions, detect };
}
describe('locateFace', () => {
  beforeEach(() => {
    forgetFaceLocator();
  });

  it('loads the detector once with the documented options', async () => {
    const { load, module, createFromOptions } = makeLoader([FACE_p4]);
    const source = document.createElement('canvas');

    const first = await locateFace(IMAGE, { load, toSource: () => source });
    const second = await locateFace(IMAGE, { load, toSource: () => source });

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(load).toHaveBeenCalledOnce();
    expect(module.FilesetResolver.forVisionTasks).toHaveBeenCalledWith(
      expect.stringContaining('/wasm')
    );
    expect(createFromOptions).toHaveBeenCalledWith(
      { wasm: 'fileset' },
      {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: MIN_CONFIDENCE,
      }
    );
  });

  it('crops around the biggest face', async () => {
    const { load } = makeLoader([
      { ...FACE_p4, boundingBox: { originX: 0, originY: 0, width: 0.1, height: 0.1 } },
      FACE_p4,
    ]);
    const box = await locateFace(IMAGE, { load, toSource: () => document.createElement('canvas') });
    expect(box).not.toBeNull();
    expect(box!.size).toBeLessThanOrEqual(8);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.size).toBeLessThanOrEqual(8);
  });

  it('returns null when there is no face', async () => {
    const { load } = makeLoader([]);
    expect(await locateFace(IMAGE, { load, toSource: () => document.createElement('canvas') })).toBeNull();
  });

  it('returns null when no image source can be built', async () => {
    const { load, detect } = makeLoader([FACE_p4]);
    expect(await locateFace(IMAGE, { load, toSource: () => null })).toBeNull();
    expect(detect).not.toHaveBeenCalled();
  });

  it('never throws: a failing download, detection or crop all give null', async () => {
    const failing = vi.fn(async () => Promise.reject(new Error('offline')));
    expect(await locateFace(IMAGE, { load: failing })).toBeNull();
    // The cache is cleared, so the next attempt starts a fresh download.
    const { load } = makeLoader([FACE_p4]);
    expect(await locateFace(IMAGE, { load, toSource: () => document.createElement('canvas') })).not.toBeNull();
    expect(failing).toHaveBeenCalledOnce();
  });

  it('clears the cache when detection throws', async () => {
    const throwing = {
      FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
      FaceDetector: {
        createFromOptions: vi.fn(async () => ({
          detect: () => {
            throw new Error('bad tensor');
          },
        })),
      },
    } as unknown as TasksVisionModule;
    const load = vi.fn(async () => throwing);
    expect(await locateFace(IMAGE, { load, toSource: () => document.createElement('canvas') })).toBeNull();
    // A second call retries the download rather than reusing the broken detector.
    await locateFace(IMAGE, { load, toSource: () => document.createElement('canvas') });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
describe('warmUpFaceLocator', () => {
  beforeEach(() => {
    forgetFaceLocator();
  });

  it('starts the download without waiting and shares it with the next call', async () => {
    const { load } = makeLoader([FACE_p4]);
    warmUpFaceLocator(load);
    await locateFace(IMAGE, { load, toSource: () => document.createElement('canvas') });
    expect(load).toHaveBeenCalledOnce();
  });

  it('swallows a failed warm-up so the next attempt can retry', async () => {
    const failing = vi.fn(async () => Promise.reject(new Error('offline')));
    warmUpFaceLocator(failing);
    // Let the rejection propagate through the cached promise's catch handler.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { load } = makeLoader([FACE_p4]);
    expect(await locateFace(IMAGE, { load, toSource: () => document.createElement('canvas') })).not.toBeNull();
    expect(failing).toHaveBeenCalledOnce();
  });
});
describe('canvasSourceOf', () => {
  it('paints the pixels into a canvas of the same size', () => {
    const canvas = canvasSourceOf(IMAGE);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect((canvas as HTMLCanvasElement).width).toBe(8);
    expect((canvas as HTMLCanvasElement).height).toBe(8);
  });

  it('gives up when the canvas has no 2D context', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(canvasSourceOf(IMAGE)).toBeNull();
    spy.mockRestore();
  });
});
