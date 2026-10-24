import type { AlphaMask, MaskShape } from './types';

export interface ShapeMaskOptions {
  readonly width: number;
  readonly height: number;
  readonly shape: MaskShape;
  /** Feather width as a fraction of the shortest image edge. */
  readonly feather: number;
}

interface ErosionGeometry {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

interface ErosionQueue {
  readonly indices: Int32Array;
  readonly values: Uint8Array;
}

interface ErosionLine {
  readonly source: Uint8ClampedArray;
  readonly destination: Uint8ClampedArray;
  readonly start: number;
  readonly step: number;
  readonly length: number;
  readonly radius: number;
  readonly queue: ErosionQueue;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function ovalDistance(x: number, y: number, width: number, height: number): number {
  const radiusX = width * 0.46;
  const radiusY = height * 0.46;
  const dx = (x - (width - 1) / 2) / radiusX;
  const dy = (y - (height - 1) / 2) / radiusY;
  return (1 - Math.hypot(dx, dy)) * Math.min(radiusX, radiusY);
}

function roundedRectDistance(x: number, y: number, width: number, height: number): number {
  const radius = Math.min(width, height) * 0.055;
  const halfWidth = width * 0.46 - radius;
  const halfHeight = height * 0.46 - radius;
  const qx = Math.abs(x - (width - 1) / 2) - halfWidth;
  const qy = Math.abs(y - (height - 1) / 2) - halfHeight;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return radius - outside - inside;
}

function alphaForDistance(distance: number, feather: number): number {
  if (distance <= 0) return 0;
  if (feather <= 0) return 255;
  return Math.round(clampUnit(distance / feather) * 255);
}

export function buildShapeMask(options: ShapeMaskOptions): AlphaMask {
  const width = Number.isFinite(options.width) ? Math.max(0, Math.floor(options.width)) : 0;
  const height = Number.isFinite(options.height) ? Math.max(0, Math.floor(options.height)) : 0;
  const data = new Uint8ClampedArray(width * height);
  if (options.shape === 'none') data.fill(255);
  if (width === 0 || height === 0 || options.shape === 'none') return { width, height, data };
  const featherAmount = Number.isFinite(options.feather) ? options.feather : 0;
  const feather = Math.max(0, Math.min(0.5, featherAmount)) * Math.min(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = options.shape === 'oval'
        ? ovalDistance(x, y, width, height)
        : roundedRectDistance(x, y, width, height);
      data[y * width + x] = alphaForDistance(distance, feather);
    }
  }
  return { width, height, data };
}

export function chokeMask(mask: AlphaMask, radius: number): AlphaMask {
  const amount = Number.isFinite(radius) ? Math.max(0, Math.floor(radius)) : 0;
  if (amount === 0) return { ...mask, data: new Uint8ClampedArray(mask.data) };
  if (amount * 2 >= mask.width || amount * 2 >= mask.height) {
    return { ...mask, data: new Uint8ClampedArray(mask.data.length) };
  }
  const geometry = { width: mask.width, height: mask.height, radius: amount };
  const horizontal = erodeRows(mask.data, geometry);
  return { ...mask, data: erodeColumns(horizontal, geometry) };
}

function erodeLine(options: ErosionLine): void {
  const { source, destination, start, step, length, radius, queue } = options;
  let head = 0;
  let tail = 0;
  let nextInput = 0;
  for (let output = 0; output < length; output += 1) {
    const lastInput = output + radius * 2;
    while (nextInput <= lastInput) {
      const sourceIndex = nextInput - radius;
      const value = sourceIndex < 0 || sourceIndex >= length ? 0 : source[start + sourceIndex * step];
      while (tail > head && queue.values[tail - 1] >= value) tail -= 1;
      queue.indices[tail] = nextInput;
      queue.values[tail] = value;
      tail += 1;
      nextInput += 1;
    }
    while (queue.indices[head] < output) head += 1;
    destination[start + output * step] = queue.values[head];
  }
}

function createErosionQueue(length: number, radius: number): ErosionQueue {
  const capacity = length + radius * 2 + 1;
  return { indices: new Int32Array(capacity), values: new Uint8Array(capacity) };
}

function erodeRows(source: Uint8ClampedArray, geometry: ErosionGeometry): Uint8ClampedArray {
  const { width, height, radius } = geometry;
  const destination = new Uint8ClampedArray(source.length);
  const queue = createErosionQueue(width, radius);
  for (let y = 0; y < height; y += 1) {
    erodeLine({ source, destination, start: y * width, step: 1, length: width, radius, queue });
  }
  return destination;
}

function erodeColumns(source: Uint8ClampedArray, geometry: ErosionGeometry): Uint8ClampedArray {
  const { width, height, radius } = geometry;
  const destination = new Uint8ClampedArray(source.length);
  const queue = createErosionQueue(height, radius);
  for (let x = 0; x < width; x += 1) {
    erodeLine({ source, destination, start: x, step: width, length: height, radius, queue });
  }
  return destination;
}