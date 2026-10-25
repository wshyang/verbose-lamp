import { GOLD_RAMPS, buildGoldRampLut } from '@/shared/lib/goldRamp';
import type { GoldRampId, RgbaImage } from './types';

/**
 * The "gold wash": each pixel's luminance is looked up on a gold ramp and blended over
 * its original colour. One LUT read per pixel, no blur, no curve — and at 85 % it keeps
 * a trace of the photo's own colour under the gold. Lifted from avatar-studio reference
 * implementation A, whose "colour only cheat" read well (ADDENDUM-019).
 */
export const DEFAULT_TINT_STRENGTH = 0.85;

export interface TintOptions {
  readonly rampId: GoldRampId;
  /** 0 keeps the photo, 1 is pure ramp gold. */
  readonly strength?: number;
}

export function tintImageGold(image: RgbaImage, options: TintOptions): RgbaImage {
  const strength = Math.min(1, Math.max(0, options.strength ?? DEFAULT_TINT_STRENGTH));
  const ramp = buildGoldRampLut(GOLD_RAMPS[options.rampId].stops);
  const source = image.data;
  const output = new Uint8ClampedArray(source.length);
  for (let offset = 0; offset < output.length; offset += 4) {
    const index = Math.round(source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722) * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = Math.round(source[offset + channel] + (ramp[index + channel] - source[offset + channel]) * strength);
    }
    output[offset + 3] = source[offset + 3];
  }
  return { width: image.width, height: image.height, data: output };
}
