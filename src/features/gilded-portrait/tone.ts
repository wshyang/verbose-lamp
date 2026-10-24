import type { LevelsSettings, RgbaImage } from './types';

export interface BlurOptions {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

export interface ClarityOptions extends BlurOptions {
  readonly amount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hasRasterShape(length: number, width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && length === width * height;
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

export function boxBlur(values: Float32Array, options: BlurOptions): Float32Array {
  const { width, height } = options;
  if (!hasRasterShape(values.length, width, height)) return values.slice();
  const radius = Math.max(0, Math.floor(options.radius));
  if (radius === 0) return values.slice();
  const horizontal = blurRows(values, { width, height, radius });
  const blurred = blurColumns(horizontal, { width, height, radius });
  preserveMean(values, blurred);
  return blurred;
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

function blurRows(values: Float32Array, options: BlurOptions): Float32Array {
  const { width, height, radius } = options;
  const output = new Float32Array(values.length);
  const prefix = new Float64Array(width + 1);
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    prefix[0] = 0;
    for (let x = 0; x < width; x += 1) prefix[x + 1] = prefix[x] + values[row + x];
    for (let x = 0; x < width; x += 1) {
      const left = x - radius;
      const right = x + radius;
      const start = Math.max(0, left);
      const end = Math.min(width - 1, right);
      let total = prefix[end + 1] - prefix[start];
      if (left < 0) total += -left * values[row];
      if (right >= width) total += (right - width + 1) * values[row + width - 1];
      output[row + x] = total / windowSize;
    }
  }
  return output;
}

function blurColumns(values: Float32Array, options: BlurOptions): Float32Array {
  const { width, height, radius } = options;
  const output = new Float32Array(values.length);
  const prefix = new Float64Array(height + 1);
  const windowSize = radius * 2 + 1;
  for (let x = 0; x < width; x += 1) {
    prefix[0] = 0;
    for (let y = 0; y < height; y += 1) prefix[y + 1] = prefix[y] + values[y * width + x];
    for (let y = 0; y < height; y += 1) {
      const top = y - radius;
      const bottom = y + radius;
      const start = Math.max(0, top);
      const end = Math.min(height - 1, bottom);
      let total = prefix[end + 1] - prefix[start];
      if (top < 0) total += -top * values[x];
      if (bottom >= height) total += (bottom - height + 1) * values[(height - 1) * width + x];
      output[y * width + x] = total / windowSize;
    }
  }
  return output;
}

function preserveMean(source: Float32Array, blurred: Float32Array): void {
  let sourceTotal = 0;
  let blurTotal = 0;
  for (let index = 0; index < source.length; index += 1) {
    sourceTotal += source[index];
    blurTotal += blurred[index];
  }
  const correction = (sourceTotal - blurTotal) / source.length;
  for (let index = 0; index < blurred.length; index += 1) blurred[index] += correction;
}