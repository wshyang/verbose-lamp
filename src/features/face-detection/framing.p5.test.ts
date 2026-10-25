// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it } from 'vitest';
import { cropFromDetection, largestFace } from './framing';
import { forgetFaceLocator, locateFace, canvasSourceOf } from './locateFace';
import { type FaceDetection, type TasksVisionModule } from './types';

const SQUARE_FRAME_p5 = { width: 1000, height: 1000 };
/** A front-facing guest at the hawker centre: eyes level, `span` apart (normalised). */
function guest_p5(span: number, boxHeight = 0): FaceDetection {
  return {
    boundingBox: { originX: 0, originY: 0, width: boxHeight, height: boxHeight },
    keypoints: [{ x: 0.5 - span / 2, y: 0.4 }, { x: 0.5 + span / 2, y: 0.4 }],
  };
}
describe('cropFromDetection', () => {
  it('returns null when the eyes are missing or degenerate', () => {
    expect(cropFromDetection({ keypoints: [] }, SQUARE_FRAME_p5)).toBeNull();
    expect(cropFromDetection({}, SQUARE_FRAME_p5)).toBeNull();
    expect(cropFromDetection(guest_p5(0), SQUARE_FRAME_p5)).toBeNull();
    expect(cropFromDetection({ keypoints: [{ x: 0.5, y: 0.4 }] }, SQUARE_FRAME_p5)).toBeNull();
  });

  it('returns null when the eye centre is not finite', () => {
    const astronomical = { keypoints: [{ x: 1e308, y: 0.3 }, { x: 1e308, y: 0.5 }] };
    expect(cropFromDetection(astronomical, SQUARE_FRAME_p5)).toBeNull();
  });
});
describe('largestFace', () => {
  it('treats a missing box as zero width', () => {
    const noBox: FaceDetection = { keypoints: [{ x: 0.45, y: 0.4 }, { x: 0.55, y: 0.4 }] };
    const boxed = guest_p5(0.1, 50);
    expect(largestFace([noBox, boxed])).toBe(boxed);
    expect(largestFace([boxed, noBox])).toBe(boxed);
  });
});
function fakeTasksVision_p5(detect: () => { detections: FaceDetection[] }): TasksVisionModule {
  return {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceDetector: { createFromOptions: async () => ({ detect }) },
  };
}
describe('locateFace', () => {
  const photo = { width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) };
  const toSource = (image: unknown) => image;
  afterEach(forgetFaceLocator);

  it('returns null when no image source can be built', async () => {
    const load = async () => fakeTasksVision_p5(() => ({ detections: [guest_p5(0.08)] }));
    expect(await locateFace(photo, { load, toSource: () => null })).toBeNull();
    expect(await locateFace(photo, { load, toSource: () => undefined })).toBeNull();
  });

  it('returns null when the detector answers without detections', async () => {
    const silent = () => ({}) as unknown as { detections: FaceDetection[] };
    const load = async () => fakeTasksVision_p5(silent);
    expect(await locateFace(photo, { load, toSource })).toBeNull();
    const empty = async () => fakeTasksVision_p5(() => ({ detections: [] }));
    forgetFaceLocator();
    expect(await locateFace(photo, { load: empty, toSource })).toBeNull();
  });

  it('returns null with the default CDN loader outside a browser', async () => {
    await expect(locateFace(photo)).resolves.toBeNull();
  });
});
describe('canvasSourceOf outside the browser', () => {
  it('returns null when there is no document (this suite runs in node)', () => {
    const image = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    expect(canvasSourceOf(image)).toBeNull();
  });
});
