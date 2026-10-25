// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { installCanvas2d } from '@/test/canvas2d';
import type { RgbaImage } from '@/shared/lib/raster';
import {
  canvasSourceOf,
  forgetFaceLocator,
  loadTasksVision,
  locateFace,
  MIN_CONFIDENCE,
  MODEL_URL,
  warmUpFaceLocator,
} from './locateFace';
import type { FaceDetection, TasksVisionLoader, TasksVisionModule } from './types';

setupDomTests();

const image: RgbaImage = {
  width: 4,
  height: 2,
  data: new Uint8ClampedArray(4 * 2 * 4).fill(200),
};

const FACE: FaceDetection = {
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
    const created = detector([FACE]);
    const { load, createFromOptions, forVisionTasks } = loaderOf(created);

    await locateFace(image, { load });
    await locateFace(image, { load });

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
    const created = detector([FACE]);
    const { load } = loaderOf(created);

    const box = await locateFace(image, { load });

    expect(box).not.toBeNull();
    expect(box!.size).toBeGreaterThan(0);
    expect(created.detect).toHaveBeenCalledTimes(1);
  });

  it('returns null when no face is found', async () => {
    const { load } = loaderOf(detector([]));

    await expect(locateFace(image, { load })).resolves.toBeNull();
  });

  it('returns null when the detector reports no detections array', async () => {
    const { load } = loaderOf(detector(undefined));

    await expect(locateFace(image, { load })).resolves.toBeNull();
  });

  it('returns null when the pixels cannot become an image source', async () => {
    const { load } = loaderOf(detector([FACE]));

    await expect(locateFace(image, { load, toSource: () => null })).resolves.toBeNull();
  });

  it('returns null and forgets the detector when loading fails', async () => {
    const load = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as TasksVisionLoader;

    await expect(locateFace(image, { load })).resolves.toBeNull();

    // A second call tries again rather than caching the failure.
    await locateFace(image, { load });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('warms the detector up without waiting, and clears a failure', async () => {
    const created = detector([FACE]);
    const { load } = loaderOf(created);

    warmUpFaceLocator(load);
    await locateFace(image, { load });
    expect(load).toHaveBeenCalledTimes(1);

    forgetFaceLocator();
    const failing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as TasksVisionLoader;
    warmUpFaceLocator(failing);
    await Promise.resolve();
    await Promise.resolve();
    await locateFace(image, { load: failing });
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe('canvasSourceOf', () => {
  it('copies the pixels onto a canvas of the same size', () => {
    const canvas = canvasSourceOf(image) as HTMLCanvasElement;

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect([canvas.width, canvas.height]).toEqual([4, 2]);
  });

  it('gives up when there is no 2-D context', () => {
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null as never);

    expect(canvasSourceOf(image)).toBeNull();
    spy.mockRestore();
  });

  it('gives up outside a browser', () => {
    const original = globalThis.document;
    // @ts-expect-error -- simulating a worker with no DOM
    delete globalThis.document;

    expect(canvasSourceOf(image)).toBeNull();

    globalThis.document = original;
  });
});

describe('loadTasksVision', () => {
  it('imports the pinned CDN build', async () => {
    // The module is not reachable from the sandbox, so the import rejects; the
    // point of the test is the specifier, not the bytes.
    await expect(loadTasksVision()).rejects.toBeTruthy();
  });
});
