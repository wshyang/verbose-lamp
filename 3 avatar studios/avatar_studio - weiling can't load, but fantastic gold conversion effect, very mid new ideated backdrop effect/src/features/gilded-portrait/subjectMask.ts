import type { RgbaImage, SubjectMask } from './types';

function colourDistance(data: Readonly<Uint8ClampedArray>, offset: number, rgb: readonly number[]): number {
  const red = data[offset] - rgb[0];
  const green = data[offset + 1] - rgb[1];
  const blue = data[offset + 2] - rgb[2];
  return Math.hypot(red, green, blue);
}

function borderColour(image: RgbaImage): readonly number[] {
  const totals = [0, 0, 0];
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (x !== 0 && y !== 0 && x !== image.width - 1 && y !== image.height - 1) continue;
      const offset = (y * image.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) totals[channel] += image.data[offset + channel];
      count += 1;
    }
  }
  return totals.map((total) => total / Math.max(1, count));
}

/** Fast local fallback for plain backdrops when the portrait model is unavailable. */
export function estimateSubjectMask(image: RgbaImage, tolerance = 54): SubjectMask {
  const background = borderColour(image);
  const alpha = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const distance = colourDistance(image.data, pixel * 4, background);
    alpha[pixel] = Math.round(Math.min(255, Math.max(0, (distance - tolerance * 0.55) * 7)));
  }
  return { width: image.width, height: image.height, alpha };
}

export function sampleMask(mask: SubjectMask, x: number, y: number, width: number, height: number): number {
  const sourceX = Math.min(mask.width - 1, Math.floor((x / Math.max(1, width)) * mask.width));
  const sourceY = Math.min(mask.height - 1, Math.floor((y / Math.max(1, height)) * mask.height));
  return mask.alpha[sourceY * mask.width + sourceX] ?? 0;
}

export function applySubjectMask(image: RgbaImage, mask: SubjectMask): RgbaImage {
  const output = new Uint8ClampedArray(image.data);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      output[offset + 3] = Math.round(output[offset + 3] * sampleMask(mask, x, y, image.width, image.height) / 255);
    }
  }
  return { width: image.width, height: image.height, data: output };
}