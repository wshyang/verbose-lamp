import { inflateSync } from 'node:zlib';

/**
 * PNG decoding and frame comparison for the renderer parity check
 * (`scripts/compare-renderers.mjs`). Pure and dependency-free, so the comparison logic is
 * unit-tested here and the script is only the browser driving. Decoding happens in Node, not
 * in the page: an in-page diff of two full frames crashed a tab that was already
 * software-rasterising a WebGL scene (PR #4's finding).
 */

export interface Frame {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel. */
  readonly data: Buffer;
}

export interface FrameComparison {
  /** Mean absolute difference per colour channel, 0 to 255, alpha ignored. */
  meanAbsDiff: number;
  /** Share of pixels whose mean channel difference exceeds `OUTLIER_THRESHOLD`. */
  outlierRatio: number;
  width: number;
  height: number;
}

/** A pixel counts as clearly changed above this mean channel difference (of 255). */
export const OUTLIER_THRESHOLD = 24;

const PNG_SIGNATURE = '89504e470d0a1a0a';
const COLOUR_TYPE_RGB = 2;
const COLOUR_TYPE_RGBA = 6;

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
}

function readChunks(buffer: Buffer): { header: PngHeader; compressed: Buffer } {
  let offset = 8;
  const header: PngHeader = { width: 0, height: 0, bitDepth: 0, colourType: 0 };
  const parts: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header.width = body.readUInt32BE(0);
      header.height = body.readUInt32BE(4);
      header.bitDepth = body[8];
      header.colourType = body[9];
    } else if (type === 'IDAT') {
      parts.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  return { header, compressed: Buffer.concat(parts) };
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** Undoes one scanline's filter in place. The five PNG filters are four short cases. */
function unfilter(filter: number, current: Buffer, previous: Buffer, channels: number): void {
  for (let x = 0; x < current.length; x += 1) {
    const left = x >= channels ? current[x - channels] : 0;
    const up = previous[x];
    const upLeft = x >= channels ? previous[x - channels] : 0;
    if (filter === 1) current[x] = (current[x] + left) & 0xff;
    else if (filter === 2) current[x] = (current[x] + up) & 0xff;
    else if (filter === 3) current[x] = (current[x] + ((left + up) >> 1)) & 0xff;
    else if (filter === 4) current[x] = (current[x] + paeth(left, up, upLeft)) & 0xff;
  }
}

/** Decodes an 8-bit RGB or RGBA PNG into RGBA bytes. */
export function decodePng(buffer: Buffer): Frame {
  if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) throw new Error('not a PNG');
  const { header, compressed } = readChunks(buffer);
  if (header.bitDepth !== 8) throw new Error(`unsupported bit depth ${header.bitDepth}`);
  if (header.colourType !== COLOUR_TYPE_RGB && header.colourType !== COLOUR_TYPE_RGBA) {
    throw new Error(`unsupported colour type ${header.colourType}`);
  }

  const channels = header.colourType === COLOUR_TYPE_RGBA ? 4 : 3;
  const stride = header.width * channels;
  const raw = inflateSync(compressed);
  const data = Buffer.alloc(header.width * header.height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const current = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    unfilter(filter, current, previous, channels);
    for (let x = 0; x < header.width; x += 1) {
      const from = x * channels;
      const to = (y * header.width + x) * 4;
      data[to] = current[from];
      data[to + 1] = current[from + 1];
      data[to + 2] = current[from + 2];
      data[to + 3] = channels === 4 ? current[from + 3] : 255;
    }
    previous = current;
  }
  return { width: header.width, height: header.height, data };
}

/** Mean absolute difference per colour channel, plus the share of clearly changed pixels. */
export function compareFrames(left: Frame, right: Frame): FrameComparison {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error('frames are a different size');
  }
  let total = 0;
  let outliers = 0;
  const count = left.width * left.height;
  for (let i = 0; i < left.data.length; i += 4) {
    const delta =
      (Math.abs(left.data[i] - right.data[i]) +
        Math.abs(left.data[i + 1] - right.data[i + 1]) +
        Math.abs(left.data[i + 2] - right.data[i + 2])) /
      3;
    total += delta;
    if (delta > OUTLIER_THRESHOLD) outliers += 1;
  }
  return {
    meanAbsDiff: Number((total / count).toFixed(2)),
    outlierRatio: Number((outliers / count).toFixed(4)),
    width: left.width,
    height: left.height,
  };
}
