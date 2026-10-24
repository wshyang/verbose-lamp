import type { RgbaImage } from './types';

/** Deterministic synthetic portrait used to protect pixel-pipeline behavior. */
export function buildStudioPortraitFixture(width = 16, height = width): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const faceRadius = Math.min(width, height) * 0.31;
  const rimRadius = Math.min(width, height) * 0.39;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      const offset = (y * width + x) * 4;
      const isFace = distance <= faceRadius;
      const isRim = distance > faceRadius && distance <= rimRadius;
      const faceLight = Math.max(0, 1 - distance / faceRadius);
      const rimLight = Math.max(0, 1 - Math.abs(distance - (faceRadius + rimRadius) / 2) / ((rimRadius - faceRadius) / 2));
      data[offset] = isFace ? 96 + Math.round(faceLight * 104) : isRim ? 90 + Math.round(rimLight * 110) : 10;
      data[offset + 1] = isFace ? 58 + Math.round(faceLight * 65) : isRim ? 56 + Math.round(rimLight * 96) : 12;
      data[offset + 2] = isFace ? 34 + Math.round(faceLight * 48) : isRim ? 32 + Math.round(rimLight * 70) : 20;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}