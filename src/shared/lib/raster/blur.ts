export interface BlurOptions {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

function hasRasterShape(length: number, width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && length === width * height;
}

/**
 * Separable box blur of a single-channel float raster, edge-clamped, with the mean preserved.
 * Returns a copy of the input unchanged when the radius is zero or the buffer does not match the
 * stated shape. Lives here, not in a feature, because the gilded portrait, background removal and
 * the avatar outline all need it (modularity review 2026-10-26, Issue 5).
 */
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
