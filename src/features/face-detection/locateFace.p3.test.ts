// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type RgbaImage } from '@/shared/lib/raster';

import { type FaceDetection, type TasksVisionModule } from './types';

import { MIN_CONFIDENCE, MODEL_URL, TASKS_VISION_URL, canvasSourceOf, forgetFaceLocator, loadTasksVision, locateFace, warmUpFaceLocator } from './locateFace';

const image: RgbaImage = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
function fakeModule(detections: readonly FaceDetection[] = []): TasksVisionModule {
  return {
    FilesetResolver: { forVisionTasks: vi.fn(async () => 'fileset') },
    FaceDetector: {
      createFromOptions: async () => ({
        detect: () => ({ detections }),
      }),
    },
  };
}
function face() {
  return {
    boundingBox: { originX: 2, originY: 2, width: 4, height: 4 },
    keypoints: [
      { x: 0.35, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.5, y: 0.55 },
    ],
  };
}
afterEach(() => {
  forgetFaceLocator();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('constants', () => {
  it('pins the CDN build, the model and the confidence floor', () => {
    expect(TASKS_VISION_URL).toContain('@mediapipe/tasks-vision');
    expect(MODEL_URL).toMatch(/\.tflite$/);
    expect(MIN_CONFIDENCE).toBe(0.5);
  });
});
describe('canvasSourceOf', () => {
  it('paints the pixels into a canvas of the photo size', () => {
    const source = canvasSourceOf(image) as HTMLCanvasElement;
    expect(source.tagName.toLowerCase()).toBe('canvas');
    expect(source.width).toBe(8);
    expect(source.height).toBe(8);
  });

  it('returns null without a document or a context', () => {
    vi.stubGlobal('document', undefined);
    expect(canvasSourceOf(image)).toBeNull();

    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => null }),
    });
    expect(canvasSourceOf(image)).toBeNull();
  });
});
describe('locateFace', () => {
  it('turns the biggest detection into an avatar crop', async () => {
    const load = vi.fn(async () => fakeModule([face()]));
    const box = await locateFace(image, { load });
    expect(load).toHaveBeenCalledTimes(1);
    expect(box).not.toBeNull();
    expect(box!.size).toBeGreaterThan(0);
    expect(box!.x).toBeGreaterThanOrEqual(0);
  });

  it('reuses the detector between calls until it is forgotten', async () => {
    const load = vi.fn(async () => fakeModule([face()]));
    await locateFace(image, { load });
    await locateFace(image, { load });
    expect(load).toHaveBeenCalledTimes(1);

    forgetFaceLocator();
    await locateFace(image, { load });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('returns null when there is no face at all', async () => {
    expect(await locateFace(image, { load: async () => fakeModule([]) })).toBeNull();
    forgetFaceLocator();
    expect(
      await locateFace(image, {
        load: async () => fakeModule([{ boundingBox: { originX: 0, originY: 0, width: 2, height: 2 } }]),
      }),
    ).toBeNull();
  });

  it('returns null when the detector cannot be loaded and clears the cache', async () => {
    const load = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await locateFace(image, { load })).toBeNull();

    const working = vi.fn(async () => fakeModule([face()]));
    expect(await locateFace(image, { load: working })).not.toBeNull();
    expect(working).toHaveBeenCalledTimes(1);
  });

  it('returns null when an image source cannot be built', async () => {
    const load = async () => fakeModule([face()]);
    expect(await locateFace(image, { load, toSource: () => null })).toBeNull();
    forgetFaceLocator();
    expect(await locateFace(image, { load, toSource: () => undefined })).toBeNull();
  });
});
describe('warmUpFaceLocator', () => {
  it('starts the download without waiting', async () => {
    const load = vi.fn(async () => fakeModule([]));
    warmUpFaceLocator(load);
    expect(load).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed warm-up so the next call tries again', async () => {
    const failing = vi.fn(async () => {
      throw new Error('nope');
    });
    warmUpFaceLocator(failing);
    await vi.waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const working = vi.fn(async () => fakeModule([face()]));
    expect(await locateFace(image, { load: working })).not.toBeNull();
    expect(working).toHaveBeenCalledTimes(1);
  });
});
describe('loadTasksVision', () => {
  it('is a function so the library stays out of the bundle', () => {
    expect(loadTasksVision).toBeTypeOf('function');
  });
});
describe('the tasks-vision CDN loader', () => {
  it('rejects honestly when the CDN cannot be reached in the sandbox', async () => {
    await expect(loadTasksVision()).rejects.toBeTruthy();
  });
});
