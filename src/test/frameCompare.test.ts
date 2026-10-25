import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compareFrames, decodePng } from './frameCompare';

/** Encodes RGBA pixels as a PNG with the given scanline filter, so the decoder is checked on real bytes. */
function encodePng(width: number, height: number, rgba: number[], filter = 0, colorType = 6): Buffer {
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const sample = (x: number, y: number): number => {
    if (x < 0 || y < 0) return 0;
    return rgba[(y * width + Math.floor(x / channels)) * 4 + (x % channels)];
  };
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x += 1) {
      const left = sample(x - channels, y);
      const up = sample(x, y - 1);
      const upLeft = sample(x - channels, y - 1);
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predicted = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      }
      raw[y * (stride + 1) + 1 + x] = (sample(x, y) - predicted) & 0xff;
    }
  }
  const chunk = (type: string, body: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(body.length, 0);
    header.write(type, 4, 'ascii');
    return Buffer.concat([header, body, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const GRADIENT = Array.from({ length: 4 * 3 * 4 }, (_, i) => (i * 37 + 11) % 256);
const opaque = (pixels: number[]) => pixels.map((value, i) => (i % 4 === 3 ? 255 : value));

describe('decodePng', () => {
  it.each([0, 1, 2, 3, 4])('round-trips pixels written with scanline filter %i', (filter) => {
    const pixels = opaque(GRADIENT);

    const decoded = decodePng(encodePng(4, 3, pixels, filter));

    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(3);
    expect(Array.from(decoded.data)).toEqual(pixels);
  });

  it('reads an RGB image as opaque RGBA', () => {
    const pixels = opaque(GRADIENT);

    const decoded = decodePng(encodePng(4, 3, pixels, 0, 2));

    for (let i = 3; i < decoded.data.length; i += 4) expect(decoded.data[i]).toBe(255);
    expect(decoded.data[0]).toBe(pixels[0]);
    expect(decoded.data[1]).toBe(pixels[1]);
  });

  it('ignores bytes after the end chunk and skips chunks it does not need', () => {
    const pixels = opaque(GRADIENT);
    const png = encodePng(4, 3, pixels, 0);
    const text = Buffer.alloc(8 + 5 + 4);
    text.writeUInt32BE(5, 0);
    text.write('tEXt', 4, 'ascii');
    const withExtras = Buffer.concat([png.subarray(0, 33), text, png.subarray(33), Buffer.from('trailing garbage')]);

    const decoded = decodePng(withExtras);

    expect(Array.from(decoded.data)).toEqual(pixels);
  });

  it('rejects data that is not a PNG', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
  });

  it('rejects colour types it cannot read', () => {
    const png = encodePng(2, 2, opaque(GRADIENT.slice(0, 16)), 0, 6);
    png[25] = 3;

    expect(() => decodePng(png)).toThrow(/unsupported colour type/);
  });

  it('rejects bit depths other than 8', () => {
    const png = encodePng(2, 2, opaque(GRADIENT.slice(0, 16)), 0, 6);
    png[24] = 16;

    expect(() => decodePng(png)).toThrow(/unsupported bit depth/);
  });
});

describe('compareFrames', () => {
  const frame = (pixels: number[], width = 2, height = 2) => ({
    width,
    height,
    data: Buffer.from(pixels),
  });
  const flat = (value: number) => frame(Array.from({ length: 16 }, (_, i) => (i % 4 === 3 ? 255 : value)));

  it('reports zero difference for identical frames', () => {
    expect(compareFrames(flat(40), flat(40))).toEqual({
      meanAbsDiff: 0,
      outlierRatio: 0,
      width: 2,
      height: 2,
    });
  });

  it('is the mean absolute difference per colour channel, ignoring alpha', () => {
    const result = compareFrames(flat(10), flat(30));

    expect(result.meanAbsDiff).toBe(20);
  });

  it('is symmetric', () => {
    const a = compareFrames(flat(10), flat(100));
    const b = compareFrames(flat(100), flat(10));

    expect(a).toEqual(b);
  });

  it('counts a pixel as an outlier only above the threshold', () => {
    const quiet = compareFrames(flat(0), flat(24));
    const loud = compareFrames(flat(0), flat(25));

    expect(quiet.outlierRatio).toBe(0);
    expect(loud.outlierRatio).toBe(1);
  });

  it('measures only the pixels that differ', () => {
    const base = Array.from({ length: 16 }, (_, i) => (i % 4 === 3 ? 255 : 0));
    const changed = [...base];
    changed[0] = 255;
    changed[1] = 255;
    changed[2] = 255;

    const result = compareFrames(frame(base), frame(changed));

    expect(result.outlierRatio).toBe(0.25);
    expect(result.meanAbsDiff).toBe(63.75);
  });

  it('refuses frames of different sizes rather than comparing garbage', () => {
    expect(() => compareFrames(frame(new Array(16).fill(0)), frame(new Array(36).fill(0), 3, 3))).toThrow(
      /different size/,
    );
  });
});
