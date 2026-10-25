// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it } from 'vitest';
import { CROP_PER_INTER_OCULAR, cropFromDetection, largestFace } from './framing';
import { forgetFaceLocator, locateFace } from './locateFace';
import { type FaceDetection, type TasksVisionModule } from './types';

const SQUARE_FRAME_p3 = { width: 1000, height: 1000 };
/** A front-facing guest at the hawker centre: eyes level, `span` apart (normalised). */
function guest_p3(span: number, boxHeight = 0): FaceDetection {
  return {
    boundingBox: { originX: 0, originY: 0, width: boxHeight, height: boxHeight },
    keypoints: [{ x: 0.5 - span / 2, y: 0.4 }, { x: 0.5 + span / 2, y: 0.4 }],
  };
}
describe('cropFromDetection', () => {
  it('returns null when the eyes land outside the coordinate space', () => {
    const runaway: FaceDetection = {
      boundingBox: { originX: 0, originY: 0, width: 10, height: 10 },
      keypoints: [{ x: 1e308, y: 0.4 }, { x: 1e308, y: 0.9 }],
    };
    expect(cropFromDetection(runaway, SQUARE_FRAME_p3)).toBeNull();
  });

  it('measures from the eyes alone when the detector gave no box', () => {
    const box = cropFromDetection({ keypoints: [{ x: 0.45, y: 0.4 }, { x: 0.55, y: 0.4 }] }, SQUARE_FRAME_p3)!;
    expect(box.size).toBeCloseTo(100 * CROP_PER_INTER_OCULAR, 6);
  });
});
describe('largestFace', () => {
  it('picks the widest face in a group shot', () => {
    const faces = [guest_p3(0.1, 40), guest_p3(0.1, 120), guest_p3(0.1, 80)];
    expect(largestFace(faces)).toBe(faces[1]);
    expect(largestFace([])).toBeNull();
    expect(largestFace([guest_p3(0.1, 120), guest_p3(0.1, 40)])?.boundingBox?.width).toBe(120);
    expect(largestFace([{}, guest_p3(0.1, 90)])?.boundingBox?.width).toBe(90);
    expect(largestFace([guest_p3(0.1, 90), {}])?.boundingBox?.width).toBe(90);
  });
});
function fakeTasksVision_p3(detect: () => { detections: FaceDetection[] }): TasksVisionModule {
  return {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceDetector: { createFromOptions: async () => ({ detect }) },
  };
}
describe('locateFace', () => {
  const photo = { width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) };
  const toSource = (image: unknown) => image;
  afterEach(forgetFaceLocator);

  it('treats a detector that returns no detections list as an empty photo', async () => {
    const load = async () => fakeTasksVision_p3(() => ({}) as { detections: FaceDetection[] });
    expect(await locateFace(photo, { load, toSource })).toBeNull();
  });
});
