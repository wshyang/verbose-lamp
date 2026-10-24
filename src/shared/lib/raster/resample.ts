import type { AlphaMask, RgbaImage, SquareBox } from './types';

interface Plane {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: ArrayLike<number>;
}

interface AxisTap {
  readonly low: number;
  readonly high: number;
  readonly weight: number;
}

interface AxisExtent {
  readonly outSize: number;
  readonly limit: number;
}

function assertSampling(plane: Plane, box: SquareBox, outSize: number): void {
  if (!Number.isInteger(outSize) || outSize <= 0) throw new RangeError('Output size must be a positive integer.');
  if (!Number.isFinite(box.size) || box.size <= 0) throw new RangeError('Crop box size must be positive.');
  if (plane.width <= 0 || plane.height <= 0 || plane.data.length !== plane.width * plane.height * plane.channels) {
    throw new RangeError('Raster buffer size does not match its dimensions.');
  }
}

/** Pixel-centre bilinear taps for one axis; positions outside the raster clamp to its edge. */
function axisTaps(origin: number, span: number, extent: AxisExtent): AxisTap[] {
  const scale = span / extent.outSize;
  return Array.from({ length: extent.outSize }, (_, index) => {
    const position = Math.min(extent.limit - 1, Math.max(0, origin + (index + 0.5) * scale - 0.5));
    const low = Math.floor(position);
    return { low, high: Math.min(extent.limit - 1, low + 1), weight: position - low };
  });
}

function samplePlane(plane: Plane, box: SquareBox, outSize: number): Uint8ClampedArray {
  assertSampling(plane, box, outSize);
  const { width, channels, data } = plane;
  const columns = axisTaps(box.x, box.size, { outSize, limit: plane.width });
  const rows = axisTaps(box.y, box.size, { outSize, limit: plane.height });
  const output = new Uint8ClampedArray(outSize * outSize * channels);
  for (let y = 0; y < outSize; y += 1) {
    const row = rows[y];
    for (let x = 0; x < outSize; x += 1) {
      const column = columns[x];
      const topLeft = (row.low * width + column.low) * channels;
      const topRight = (row.low * width + column.high) * channels;
      const bottomLeft = (row.high * width + column.low) * channels;
      const bottomRight = (row.high * width + column.high) * channels;
      const target = (y * outSize + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        const top = data[topLeft + channel] + (data[topRight + channel] - data[topLeft + channel]) * column.weight;
        const bottom = data[bottomLeft + channel] + (data[bottomRight + channel] - data[bottomLeft + channel]) * column.weight;
        output[target + channel] = Math.round(top + (bottom - top) * row.weight);
      }
    }
  }
  return output;
}

/** Bilinear square crop of an RGBA image to `outSize`². Never mutates the source. */
export function cropSquare(image: RgbaImage, box: SquareBox, outSize: number): RgbaImage {
  const plane = { width: image.width, height: image.height, channels: 4, data: image.data };
  return { width: outSize, height: outSize, data: samplePlane(plane, box, outSize) };
}

/** The same crop as `cropSquare`, for a one-channel mask, so a matte stays aligned with its photo. */
export function resampleAlpha(mask: AlphaMask, box: SquareBox, outSize: number): AlphaMask {
  const plane = { width: mask.width, height: mask.height, channels: 1, data: mask.data };
  return { width: outSize, height: outSize, data: samplePlane(plane, box, outSize) };
}

/** A mask of one value everywhere, for "keep the whole square" decisions. */
export function solidAlpha(size: number, value = 255): AlphaMask {
  return { width: size, height: size, data: new Uint8ClampedArray(size * size).fill(value) };
}
