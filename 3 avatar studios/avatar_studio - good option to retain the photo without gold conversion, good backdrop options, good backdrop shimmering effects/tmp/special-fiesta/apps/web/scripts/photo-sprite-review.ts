#!/usr/bin/env -S npx tsx
/**
 * ADR-031 — the photo pipeline, run over real photographs and rendered side by side.
 *
 *   npm run photo:review --workspace @psd/web
 *   npx tsx apps/web/scripts/photo-sprite-review.ts images/ingest/passport-male.png
 *
 * This is the *colour* cut-out only (ADR-031/032). The segmentation model (ADR-033) needs
 * a browser and a network for its weights, so it is reviewed in the app itself.
 *
 * There is no headless browser here (ADR-013) and no image library, so this decodes the
 * PNG itself, runs the very same pipeline the studio runs, and writes
 * `docs/screenshot/photo-sprites.png`: each photo on the left, the sprite it becomes on
 * the right. Looking at that sheet is the only way to judge the conversion.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';
import { parseAvatarSprite } from '@psd/contracts';
import { faceBox, photoToSprite, type Bitmap } from '../src/lib/avatar/photoSprite.js';

function decodePng(path: string): Bitmap {
  const file = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colourType = 6;
  const parts: Buffer[] = [];
  while (pos < file.length) {
    const length = file.readUInt32BE(pos);
    const type = file.toString('ascii', pos + 4, pos + 8);
    const data = file.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colourType = data[9] ?? 6;
    }
    if (type === 'IDAT') parts.push(data);
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const channels = colourType === 2 ? 3 : 4;
  const stride = width * channels;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let previous = Buffer.alloc(stride);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset];
    offset += 1;
    const line = Buffer.from(raw.subarray(offset, offset + stride));
    offset += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? (line[x - channels] ?? 0) : 0;
      const b = previous[x] ?? 0;
      const c = x >= channels ? (previous[x - channels] ?? 0) : 0;
      const current = line[x] ?? 0;
      if (filter === 1) line[x] = (current + a) & 255;
      if (filter === 2) line[x] = (current + b) & 255;
      if (filter === 3) line[x] = (current + Math.floor((a + b) / 2)) & 255;
      if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        line[x] = (current + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const to = (y * width + x) * 4;
      pixels[to] = line[x * channels] ?? 0;
      pixels[to + 1] = line[x * channels + 1] ?? 0;
      pixels[to + 2] = line[x * channels + 2] ?? 0;
      pixels[to + 3] = 255;
    }
    previous = line;
  }
  return { width, height, pixels };
}

function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** One tile: the photo on the left, the sprite it becomes on the right. */
function review(photo: Bitmap, code: string, zoom: number): Uint8ClampedArray {
  const sprite = parseAvatarSprite(code);
  if (sprite === null) throw new Error('sprite did not parse');
  const side = sprite.size * zoom;
  const out = new Uint8ClampedArray(side * side * 2 * 4);
  const put = (x: number, y: number, hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
    const to = (y * side * 2 + x) * 4;
    out[to] = r ?? 0;
    out[to + 1] = g ?? 0;
    out[to + 2] = b ?? 0;
    out[to + 3] = 255;
  };
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const source = photo.pixels;
      const px = Math.floor((x / side) * photo.width);
      const py = Math.floor((y / side) * photo.height);
      const at = (py * photo.width + px) * 4;
      const to = (y * side * 2 + x) * 4;
      out[to] = source[at] ?? 0;
      out[to + 1] = source[at + 1] ?? 0;
      out[to + 2] = source[at + 2] ?? 0;
      out[to + 3] = 255;
      const cell = sprite.rows[Math.floor(y / zoom)]?.charAt(Math.floor(x / zoom)) ?? '0';
      put(side + x, y, sprite.palette[cell] ?? '#000000');
    }
  }
  return out;
}

const args = process.argv.slice(2);
const outName = args.find((arg) => arg.startsWith('--out='))?.slice('--out='.length)
  ?? 'photo-sprites.png';
const photos = args.filter((arg) => !arg.startsWith('--')).length > 0
  ? args.filter((arg) => !arg.startsWith('--'))
  : ['images/ingest/passport-female.png', 'images/ingest/passport-male.png'];

// A couple of booth photos deserve to be big; forty social-media shots need a grid.
const zoom = photos.length > 8 ? 2 : 5;
const columns = photos.length > 8 ? 4 : 1;
const sheets = photos.map((path) => {
  const photo = decodePng(path.startsWith('/') ? path : `${process.cwd()}/../../${path}`);
  const code = photoToSprite(photo, { backdrop: '#1d5b8c', ink: '#12243a' });
  const box = faceBox(photo);
  console.log(
    `${path}: ${photo.width}×${photo.height} → crop ${Math.round(box.size)}px at ` +
      `(${Math.round(box.x)}, ${Math.round(box.y)}) → ${code.length} characters of sprite`,
  );
  return { photo, code };
});

const spriteSize = parseAvatarSprite(sheets[0]?.code ?? '')?.size;
if (spriteSize === undefined) throw new Error('first sprite did not parse');
const side = spriteSize * zoom;
const tileWidth = side * 2;
const rows = Math.ceil(sheets.length / columns);
const width = tileWidth * columns;
const height = side * rows;
const canvas = new Uint8ClampedArray(width * height * 4);
sheets.forEach(({ photo, code }, index) => {
  const tile = review(photo, code, zoom);
  const originX = (index % columns) * tileWidth;
  const originY = Math.floor(index / columns) * side;
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < tileWidth; x += 1) {
      const from = (y * tileWidth + x) * 4;
      const to = ((originY + y) * width + originX + x) * 4;
      canvas.set(tile.subarray(from, from + 4), to);
    }
  }
});
const out = `${process.cwd()}/../../docs/screenshot/${outName}`;
writeFileSync(out, encodePng(width, height, canvas));
console.log(`photo sprites: ${out} (${width}×${height})`);
