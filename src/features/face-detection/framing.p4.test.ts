// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { CROP_PER_INTER_OCULAR, cropFromDetection, largestFace } from './framing';
import { type FaceDetection } from './types';

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
