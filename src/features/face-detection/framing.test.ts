import { afterEach, describe, expect, it } from 'vitest';
import { CROP_PER_INTER_OCULAR, EYE_LINE, HEAD_OVER_FACE, HEAD_SHARE, cropFromDetection, largestFace } from './framing';
import { forgetFaceLocator, locateFace } from './locateFace';
import type { FaceDetection, TasksVisionModule } from './types';

const SQUARE_FRAME = { width: 1000, height: 1000 };

/** A front-facing guest at the hawker centre: eyes level, `span` apart (normalised). */
function guest(span: number, boxHeight = 0): FaceDetection {
  return {
    boundingBox: { originX: 0, originY: 0, width: boxHeight, height: boxHeight },
    keypoints: [{ x: 0.5 - span / 2, y: 0.4 }, { x: 0.5 + span / 2, y: 0.4 }],
  };
}

describe('cropFromDetection', () => {
  it('puts the eyes on the eye line, centred', () => {
    const box = cropFromDetection(guest(0.1), SQUARE_FRAME);
    expect(box).not.toBeNull();
    expect((400 - box!.y) / box!.size).toBeCloseTo(EYE_LINE, 6);
    expect(box!.x + box!.size / 2).toBeCloseTo(500, 6);
  });

  it('scales the crop with inter-ocular distance', () => {
    const narrow = cropFromDetection(guest(0.05), SQUARE_FRAME)!;
    const wide = cropFromDetection(guest(0.1), SQUARE_FRAME)!;
    expect(narrow.size).toBeCloseTo(50 * CROP_PER_INTER_OCULAR, 6);
    expect(wide.size / narrow.size).toBeCloseTo(2, 6);
  });

  it('applies the bounding-box floor to a face in profile', () => {
    const profile = cropFromDetection(guest(0.01, 300), SQUARE_FRAME)!;
    expect(profile.size).toBeCloseTo((300 * HEAD_OVER_FACE) / HEAD_SHARE, 6);
  });

  it('caps the square at the shortest edge of a 640×480 photo and keeps it inside', () => {
    const box = cropFromDetection(guest(0.5), { width: 640, height: 480 })!;
    expect(box.size).toBe(480);
    expect(box.y).toBe(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.size).toBeLessThanOrEqual(640);
  });

  it('returns null when the eyes are missing or degenerate', () => {
    expect(cropFromDetection({ keypoints: [] }, SQUARE_FRAME)).toBeNull();
    expect(cropFromDetection({}, SQUARE_FRAME)).toBeNull();
    expect(cropFromDetection(guest(0), SQUARE_FRAME)).toBeNull();
  });
});

describe('largestFace', () => {
  it('picks the widest face in a group shot', () => {
    const faces = [guest(0.1, 40), guest(0.1, 120), guest(0.1, 80)];
    expect(largestFace(faces)).toBe(faces[1]);
    expect(largestFace([])).toBeNull();
  });
});

function fakeTasksVision(detect: () => { detections: FaceDetection[] }): TasksVisionModule {
  return {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceDetector: { createFromOptions: async () => ({ detect }) },
  };
}

describe('locateFace', () => {
  const photo = { width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) };
  const toSource = (image: unknown) => image;
  afterEach(forgetFaceLocator);

  it('frames the largest detected face', async () => {
    const load = async () => fakeTasksVision(() => ({ detections: [guest(0.08, 60)] }));
    const box = await locateFace(photo, { load, toSource });
    expect(box).not.toBeNull();
    expect(box!.size).toBeCloseTo(Math.hypot(0.08 * 640, 0) * CROP_PER_INTER_OCULAR, 4);
  });

  it('returns null when the library cannot be loaded', async () => {
    const box = await locateFace(photo, { load: () => Promise.reject(new Error('offline')), toSource });
    expect(box).toBeNull();
  });

  it('returns null when the detector throws, and a later call can retry', async () => {
    const broken = async () => fakeTasksVision(() => { throw new Error('wasm trap'); });
    expect(await locateFace(photo, { load: broken, toSource })).toBeNull();
    const working = async () => fakeTasksVision(() => ({ detections: [guest(0.08)] }));
    expect(await locateFace(photo, { load: working, toSource })).not.toBeNull();
  });

  it('returns null when no image source can be built', async () => {
    const load = async () => fakeTasksVision(() => ({ detections: [guest(0.08)] }));
    expect(await locateFace(photo, { load, toSource: () => null })).toBeNull();
  });
});

describe('cropFromDetection guards', () => {
  const frame = { width: 100, height: 100 };

  it('refuses eyes that are missing or too close together', () => {
    expect(cropFromDetection({ keypoints: [] } as never, frame)).toBeNull();
    expect(
      cropFromDetection(
        { keypoints: [{ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.5 }] } as never,
        frame
      )
    ).toBeNull();
  });

  it('refuses a detection whose eye midpoint is not a number', () => {
    expect(
      cropFromDetection(
        { keypoints: [{ x: Number.NaN, y: 0.5 }, { x: 0.9, y: 0.5 }] } as never,
        frame
      )
    ).toBeNull();
  });

  it('keeps the crop square and inside the photo', () => {
    const box = cropFromDetection(
      { keypoints: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }], boundingBox: { height: 0.4 } } as never,
      { width: 100, height: 60 }
    );
    expect(box).not.toBeNull();
    expect(box!.size).toBeLessThanOrEqual(60);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.size).toBeLessThanOrEqual(60);
  });
});

describe('faces without a bounding box', () => {
  it('compares widths as zero and ignores the box floor', () => {
    const eyesOnly: FaceDetection = {
      keypoints: [
        { x: 0.3, y: 0.4 },
        { x: 0.7, y: 0.4 },
      ],
    };
    expect(largestFace([eyesOnly])).toBe(eyesOnly);
    const boxed = { ...eyesOnly, boundingBox: { originX: 0, originY: 0, width: 0.3, height: 0.3 } };
    // A later face with no box measures zero and must not displace the boxed face.
    expect(largestFace([boxed, eyesOnly])).toBe(boxed);
    expect(largestFace([eyesOnly, { ...eyesOnly, boundingBox: { originX: 0, originY: 0, width: 0.3, height: 0.3 } }])).toEqual(
      expect.objectContaining({ boundingBox: expect.anything() })
    );
    const box = cropFromDetection(eyesOnly, { width: 100, height: 100 });
    expect(box).not.toBeNull();
    // With no box, the crop is driven purely by the inter-ocular span.
    expect(box!.size).toBeCloseTo(Math.min(100, 40 * CROP_PER_INTER_OCULAR), 6);
  });
});
