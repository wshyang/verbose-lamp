// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { type RgbaImage } from '@/shared/lib/raster';

import { type FaceDetection, type TasksVisionModule, type TasksVisionLoader } from './types';

import { MIN_CONFIDENCE, MODEL_URL, canvasSourceOf, forgetFaceLocator, locateFace, warmUpFaceLocator } from './locateFace';

import { setupDomTests } from '@/test/dom';

import { installCanvas2d } from '@/test/canvas2d';

setupDomTests();
const image_p6: RgbaImage = {
  width: 4,
  height: 2,
  data: new Uint8ClampedArray(4 * 2 * 4).fill(200),
};
const FACE_p6: FaceDetection = {
  boundingBox: { originX: 0, originY: 0, width: 4, height: 2 },
  keypoints: [
    { x: 0.1, y: 0.4 },
    { x: 0.9, y: 0.4 },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.6 },
  ],
};
const detector = (detections?: readonly FaceDetection[]) => ({
  detect: vi.fn(() => (detections === undefined ? {} : { detections })),
});
const moduleOf = (created: ReturnType<typeof detector>) => {
  const createFromOptions = vi.fn(async () => created);
  const forVisionTasks = vi.fn(async () => 'fileset');
  return {
    module: { FilesetResolver: { forVisionTasks }, FaceDetector: { createFromOptions } } as TasksVisionModule,
    createFromOptions,
    forVisionTasks,
  };
};
const loaderOf = (created: ReturnType<typeof detector>) => {
  const { module, createFromOptions, forVisionTasks } = moduleOf(created);
  const load: TasksVisionLoader = vi.fn(async () => module);
  return { load, createFromOptions, forVisionTasks };
};
beforeEach(() => {
  installCanvas2d();
  forgetFaceLocator();
});
describe('locateFace', () => {
  it('loads BlazeFace once and asks for the full-range model', async () => {
    const created = detector([FACE_p6]);
    const { load, createFromOptions, forVisionTasks } = loaderOf(created);

    await locateFace(image_p6, { load });
    await locateFace(image_p6, { load });

    expect(load).toHaveBeenCalledTimes(1);
    expect(forVisionTasks).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
    );
    expect(createFromOptions).toHaveBeenCalledWith('fileset', {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: MIN_CONFIDENCE,
    });
    expect(MODEL_URL).toContain('blaze_face_full_range');
  });

  it('returns the largest face as an avatar crop', async () => {
    const created = detector([FACE_p6]);
    const { load } = loaderOf(created);

    const box = await locateFace(image_p6, { load });

    expect(box).not.toBeNull();
    expect(box!.size).toBeGreaterThan(0);
    expect(created.detect).toHaveBeenCalledTimes(1);
  });

  it('returns null when no face is found', async () => {
    const { load } = loaderOf(detector([]));

    await expect(locateFace(image_p6, { load })).resolves.toBeNull();
  });

  it('returns null when the pixels cannot become an image source', async () => {
    const { load } = loaderOf(detector([FACE_p6]));

    await expect(locateFace(image_p6, { load, toSource: () => null })).resolves.toBeNull();
  });

  it('returns null and forgets the detector when loading fails', async () => {
    const load = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as TasksVisionLoader;

    await expect(locateFace(image_p6, { load })).resolves.toBeNull();

    // A second call tries again rather than caching the failure.
    await locateFace(image_p6, { load });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('warms the detector up without waiting, and clears a failure', async () => {
    const created = detector([FACE_p6]);
    const { load } = loaderOf(created);

    warmUpFaceLocator(load);
    await locateFace(image_p6, { load });
    expect(load).toHaveBeenCalledTimes(1);

    forgetFaceLocator();
    const failing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as TasksVisionLoader;
    warmUpFaceLocator(failing);
    await Promise.resolve();
    await Promise.resolve();
    await locateFace(image_p6, { load: failing });
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
describe('canvasSourceOf', () => {
  it('copies the pixels onto a canvas of the same size', () => {
    const canvas = canvasSourceOf(image_p6) as HTMLCanvasElement;

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect([canvas.width, canvas.height]).toEqual([4, 2]);
  });
});
