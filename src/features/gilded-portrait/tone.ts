import { boxBlur, type BlurOptions } from '@/shared/lib/raster';
import type { LevelsSettings, RgbaImage } from './types';

/** The blur moved to `@/shared/lib/raster`; re-exported so this feature's API and tests are unchanged. */
export { boxBlur, type BlurOptions };

export interface ClarityOptions extends BlurOptions {
  readonly amount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toLuminance(image: RgbaImage): Float32Array {
  const pixelCount = image.width * image.height;
  const luminance = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    luminance[pixel] = (
      image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722
    ) / 255;
  }
  return luminance;
}

export function applyLevels(values: Float32Array, settings: LevelsSettings): Float32Array {
  const output = new Float32Array(values.length);
  const black = clamp(settings.blackPoint, 0, 254 / 255);
  const white = clamp(settings.whitePoint, black + 1 / 255, 1);
  const gamma = clamp(settings.gamma, 0.05, 5);
  const span = Math.max(1 / 255, white - black);
  for (let index = 0; index < values.length; index += 1) {
    const level = clamp((values[index] - black) / span, 0, 1);
    output[index] = Math.pow(level, 1 / gamma);
  }
  return output;
}

export function applyClarity(values: Float32Array, options: ClarityOptions): Float32Array {
  const blurred = boxBlur(values, options);
  const amount = clamp(options.amount, 0, 3);
  const output = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    output[index] = values[index] + (values[index] - blurred[index]) * amount;
  }
  return output;
}
