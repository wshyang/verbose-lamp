import { describe, expect, it } from 'vitest';
import { cropBoxFromFace, CROP_PER_INTER_OCULAR, skinCropBox } from './faceCrop';
import type { RgbaImage } from '../types';

function imageOf(width: number, height: number, fill: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < width * height; at += 1) {
    data[at * 4] = fill[0];
    data[at * 4 + 1] = fill[1];
    data[at * 4 + 2] = fill[2];
    data[at * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('the crop the detector asks for', () => {
  it('is a square sized from the distance between the eyes', () => {
    const face = { keypoints: [{ x: 0.48, y: 0.4 }, { x: 0.52, y: 0.4 }] };
    const crop = cropBoxFromFace(face, 400, 600);
    expect(crop).not.toBeNull();
    expect(crop?.size).toBeCloseTo(16 * CROP_PER_INTER_OCULAR, 5);
  });

  it('puts the eye line 52 % down the square', () => {
    const face = { keypoints: [{ x: 0.45, y: 0.5 }, { x: 0.55, y: 0.5 }] };
    const crop = cropBoxFromFace(face, 200, 200);
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(200 * 0.5 - crop.y).toBeCloseTo(crop.size * 0.52, 5);
  });

  it('never runs off the edge of the picture', () => {
    const face = { keypoints: [{ x: 0.02, y: 0.02 }, { x: 0.06, y: 0.02 }] };
    const crop = cropBoxFromFace(face, 300, 300);
    expect(crop?.x).toBeGreaterThanOrEqual(0);
    expect(crop?.y).toBeGreaterThanOrEqual(0);
  });

  it('is refused when there are no eyes to measure', () => {
    expect(cropBoxFromFace({ keypoints: [] }, 300, 300)).toBeNull();
  });

  it('is refused when the eyes are implausibly close together', () => {
    const face = { keypoints: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }] };
    expect(cropBoxFromFace(face, 300, 300)).toBeNull();
  });

  it('keeps the square inside the shortest edge of the picture', () => {
    const face = { keypoints: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }] };
    const crop = cropBoxFromFace(face, 600, 200);
    expect(crop?.size).toBeLessThanOrEqual(200);
  });
});

describe('the crop guessed from skin', () => {
  it('centres the square when there is no skin to find', () => {
    const crop = skinCropBox(imageOf(300, 400, [10, 20, 90]));
    expect(crop.size).toBe(300);
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(50);
  });

  it('tightens around a face-like patch of skin', () => {
    const pixels = new Uint8ClampedArray(400 * 400 * 4);
    for (let at = 0; at < 400 * 400; at += 1) {
      pixels[at * 4] = 20;
      pixels[at * 4 + 1] = 20;
      pixels[at * 4 + 2] = 20;
      pixels[at * 4 + 3] = 255;
    }
    for (let y = 140; y < 260; y += 1) {
      for (let x = 160; x < 240; x += 1) {
        const at = (y * 400 + x) * 4;
        pixels[at] = 226;
        pixels[at + 1] = 168;
        pixels[at + 2] = 132;
      }
    }
    const crop = skinCropBox({ width: 400, height: 400, data: pixels });
    expect(crop.size).toBeLessThan(400);
    expect(crop.x).toBeGreaterThan(0);
    expect(crop.y).toBeGreaterThan(0);
  });
});
