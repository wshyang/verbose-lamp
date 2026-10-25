// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { cropFromDetection } from './framing';
import { type FaceDetection } from './types';

describe('cropFromDetection', () => {
  it('returns null when the eye midpoint overflows while the span stays finite', () => {
    // Equal huge x keypoints cancel in the span (driven by y here) but their
    // midpoint overflows to Infinity.
    const face: FaceDetection = {
      keypoints: [{ x: 1.7e308, y: 0.9 }, { x: 1.7e308, y: 0.1 }],
    };
    expect(cropFromDetection(face, { width: 1, height: 1000 })).toBeNull();
  });
});
