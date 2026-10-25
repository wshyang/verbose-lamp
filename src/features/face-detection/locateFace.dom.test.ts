// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropFromDetection, largestFace } from './framing';
import {
  canvasSourceOf, forgetFaceLocator, loadTasksVision, locateFace, warmUpFaceLocator,
} from './locateFace';
import type { FaceDetection, TasksVisionModule } from './types';

const IMAGE = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function moduleWith(detect: () => { detections?: readonly FaceDetection[] }): TasksVisionModule {
  return {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceDetector: { createFromOptions: async () => ({ detect }) },
  };
}

afterEach(() => {
  forgetFaceLocator();
  vi.restoreAllMocks();
});

describe('face framing optional-box branches', () => {
  it('treats missing boxes as zero width/height', () => {
    const noBox: FaceDetection = { keypoints: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }] };
    const boxed: FaceDetection = {
      boundingBox: { originX: 0, originY: 0, width: 10, height: 10 },
    };
    expect(largestFace([noBox, boxed])).toBe(boxed);
    expect(largestFace([boxed, noBox])).toBe(boxed);
    expect(cropFromDetection(noBox, { width: 100, height: 100 })?.size).toBeGreaterThan(0);
  });
});

describe('canvasSourceOf', () => {
  it('paints pixels to a canvas and returns it', () => {
    const pixels = { data: new Uint8ClampedArray(16) };
    const context = { createImageData: vi.fn(() => pixels), putImageData: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const canvas = canvasSourceOf(IMAGE) as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([2, 2]);
    expect(context.putImageData).toHaveBeenCalledWith(pixels, 0, 0);
  });

  it('returns null without a 2d context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(canvasSourceOf(IMAGE)).toBeNull();
  });
});

describe('warmUpFaceLocator and loader defaults', () => {
  it('starts a custom loader and clears a failed warm-up for retry', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('offline')));
    warmUpFaceLocator(failing);
    await flush();
    const working = vi.fn(async () => moduleWith(() => ({ detections: [] })));
    warmUpFaceLocator(working);
    await flush();
    expect(failing).toHaveBeenCalledOnce();
    expect(working).toHaveBeenCalledOnce();
  });

  it('invokes the default module loader without letting warm-up throw', async () => {
    await expect(loadTasksVision()).rejects.toBeDefined();
    forgetFaceLocator();
    expect(() => warmUpFaceLocator()).not.toThrow();
    await flush();
  });
});

describe('locateFace empty/undefined branches', () => {
  it('handles undefined source and undefined detections', async () => {
    const load = async () => moduleWith(() => ({}));
    expect(await locateFace(IMAGE, { load, toSource: () => undefined })).toBeNull();
    forgetFaceLocator();
    expect(await locateFace(IMAGE, { load, toSource: () => ({}) })).toBeNull();
  });
});
