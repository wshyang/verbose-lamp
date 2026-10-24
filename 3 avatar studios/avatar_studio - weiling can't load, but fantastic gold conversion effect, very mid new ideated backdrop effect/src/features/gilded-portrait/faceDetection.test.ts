import { describe, expect, it } from 'vitest';
import { clampFaceBox, selectLargestFace } from './faceDetection';

describe('face box selection', () => {
  it('selects the largest face in a group portrait', () => {
    const selected = selectLargestFace([
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 30, y: 15, width: 80, height: 65 },
    ]);
    expect(selected).toEqual({ x: 30, y: 15, width: 80, height: 65 });
  });

  it('keeps detector geometry inside the image', () => {
    expect(clampFaceBox(
      { x: -5, y: 80, width: 120, height: 80 },
      { width: 100, height: 100 },
    )).toEqual({ x: 0, y: 80, width: 100, height: 20 });
  });
});