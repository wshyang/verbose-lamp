#!/usr/bin/env -S npx tsx
/**
 * ADR-040 — the recorded demo crowd, rendered against the photographs it came from.
 *
 *   cd apps/web && npx tsx scripts/seed-sprite-compare.ts
 *
 * `scripts/demo-participants.dump.json` holds the sprites exactly as the browser made
 * them during `npm run demo:record` — fixed happy-path detector box, stand-in model
 * mask, 14-colour quantisation, 128×128. This sheet puts each source photo beside the
 * sprite the seed actually wears, so likeness can be judged with eyes rather than
 * faith, and prints per-photo numbers: how much of the tile is subject, and the mean
 * colour error between sprite cells and the photo pixels they summarise.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';
import { parseAvatarSprite } from '@psd/contracts';
import type { Bitmap } from '../src/lib/avatar/photoSprite.js';

const ROOT = `${process.cwd()}/../..`;

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

/**
 * The recording's geometry, reproduced (see e2e/photo-stubs.ts): the working bitmap is
 * the photo at 640px max, and the happy-path detector box (220,130,200×240) becomes,
 * through `detectFaceBox`, a 483px crop at (78,0). The sprite cell at (cx, cy) therefore
 * summarises the photo pixels under that square — which is what the error measures.
 */
const WORKING = 640;
const CROP = { x: 78.3, y: 0, size: 483.3 };

interface Row {
  sourceImage: string;
  nickname: string;
  avatarPhoto: string;
}

const dump = JSON.parse(readFileSync(`${ROOT}/scripts/demo-participants.dump.json`, 'utf8')) as {
  participants: Row[];
};

const CELL = 256;
const COLUMNS = 4;
const tiles = dump.participants.length;
const rows = Math.ceil(tiles / COLUMNS);
const sheetWidth = CELL * 2 * COLUMNS;
const sheetHeight = CELL * rows;
const canvas = new Uint8ClampedArray(sheetWidth * sheetHeight * 4);

console.log('photo, subject %, mean colour error (subject cells, 0-255 per channel)');
const stats: { name: string; subject: number; error: number }[] = [];

dump.participants.forEach((row, index) => {
  // ADR-059 — a persona whose photo was dropped wears a drawn character and stores no sprite, so
  // there is nothing here to compare against a photograph. Skipping is not a failure: the recorder
  // deliberately allows it (it only insists 80 % of personas end up with a sprite), and this script
  // used to throw on the first one, which made the likeness audit unrunnable on any real dump.
  if (row.avatarPhoto === null || row.avatarPhoto === undefined) return;
  const sprite = parseAvatarSprite(row.avatarPhoto);
  if (sprite === null) throw new Error(`${row.nickname}: sprite did not parse`);
  const photo = decodePng(`${ROOT}/${row.sourceImage}`);
  const scale = Math.min(1, WORKING / Math.max(photo.width, photo.height));
  const cropSize = CROP.size / scale;
  const cropX = CROP.x / scale;
  const cropY = CROP.y / scale;

  // The palette is a char-keyed record; formatAvatarSprite appends backdrop then ink
  // last, so the two highest keys are the cut-out colour and its outline.
  const keys = Object.keys(sprite.palette).sort(
    (a, b) => Number.parseInt(a, 16) - Number.parseInt(b, 16),
  );
  const backdropIndex = keys[keys.length - 2] ?? '';
  const inkIndex = keys[keys.length - 1] ?? '';
  let subjectCells = 0;
  let errorSum = 0;

  const originX = (index % COLUMNS) * CELL * 2;
  const originY = Math.floor(index / COLUMNS) * CELL;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      // Left: the photograph, whole, letterboxed to the cell.
      const px = Math.floor((x / CELL) * photo.width);
      const py = Math.floor((y / CELL) * photo.height);
      const at = (py * photo.width + px) * 4;
      const to = ((originY + y) * sheetWidth + originX + x) * 4;
      canvas[to] = photo.pixels[at] ?? 0;
      canvas[to + 1] = photo.pixels[at + 1] ?? 0;
      canvas[to + 2] = photo.pixels[at + 2] ?? 0;
      canvas[to + 3] = 255;

      // Right: the sprite the seed wears, doubled.
      const cellChar = sprite.rows[Math.floor(y / 2)]?.charAt(Math.floor(x / 2)) ?? '0';
      const hexColour = sprite.palette[cellChar] ?? '#000000';
      const [r, g, b] = [1, 3, 5].map((slice) =>
        Number.parseInt(hexColour.slice(slice, slice + 2), 16),
      );
      const toRight = ((originY + y) * sheetWidth + originX + CELL + x) * 4;
      canvas[toRight] = r ?? 0;
      canvas[toRight + 1] = g ?? 0;
      canvas[toRight + 2] = b ?? 0;
      canvas[toRight + 3] = 255;
    }
  }

  // The numbers: walk the 128 grid once against the photo pixels under the crop.
  for (let cy = 0; cy < sprite.size; cy += 1) {
    const spriteRow = sprite.rows[cy] ?? '';
    for (let cx = 0; cx < sprite.size; cx += 1) {
      const cellChar = spriteRow.charAt(cx);
      if (cellChar === backdropIndex || cellChar === inkIndex) continue;
      subjectCells += 1;
      const sx = Math.min(photo.width - 1, Math.round(cropX + ((cx + 0.5) / sprite.size) * cropSize));
      const sy = Math.min(photo.height - 1, Math.round(cropY + ((cy + 0.5) / sprite.size) * cropSize));
      const at = (sy * photo.width + sx) * 4;
      const hexColour = sprite.palette[cellChar] ?? '#000000';
      const [r, g, b] = [1, 3, 5].map((slice) =>
        Number.parseInt(hexColour.slice(slice, slice + 2), 16),
      );
      errorSum +=
        (Math.abs((photo.pixels[at] ?? 0) - (r ?? 0)) +
          Math.abs((photo.pixels[at + 1] ?? 0) - (g ?? 0)) +
          Math.abs((photo.pixels[at + 2] ?? 0) - (b ?? 0))) /
        3;
    }
  }

  const subject = subjectCells / (sprite.size * sprite.size);
  const error = subjectCells === 0 ? 0 : errorSum / subjectCells;
  stats.push({ name: row.sourceImage, subject, error });
  console.log(
    `${row.sourceImage}: subject ${(subject * 100).toFixed(0)}%, error ${error.toFixed(1)}`,
  );
});

const sorted = [...stats].sort((a, b) => b.error - a.error);
console.log('\nworst ten by colour error:');
for (const stat of sorted.slice(0, 10)) {
  console.log(`  ${stat.name}: ${stat.error.toFixed(1)} (subject ${(stat.subject * 100).toFixed(0)}%)`);
}
const mean = stats.reduce((sum, stat) => sum + stat.error, 0) / stats.length;
console.log(`\nmean colour error over all ${stats.length}: ${mean.toFixed(1)}`);

const out = `${ROOT}/docs/screenshot/seed-sprite-compare.png`;
writeFileSync(out, encodePng(sheetWidth, sheetHeight, canvas));
console.log(`sheet: ${out} (${sheetWidth}×${sheetHeight})`);
