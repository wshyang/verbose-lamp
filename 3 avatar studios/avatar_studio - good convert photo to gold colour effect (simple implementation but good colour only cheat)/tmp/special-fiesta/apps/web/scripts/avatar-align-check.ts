#!/usr/bin/env -S npx tsx
/**
 * A LARGE side-by-side of a few recorded avatars against their source photographs, for diagnosing
 * crop alignment by eye.
 *
 *   cd apps/web && npx tsx scripts/avatar-align-check.ts [count] [offset]
 *
 * `seed-sprite-compare.ts` already renders all eighty, but at eighty rows each pair is ~64 px tall —
 * enough to audit colour drift, far too small to see WHERE a crop landed. This renders a handful at
 * 512 px each and, crucially, draws the crop rectangle the stubbed recording actually used onto the
 * source photo, so "misaligned" becomes something to point at rather than infer.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { parseAvatarSprite } from '@psd/contracts';

const ROOT = `${process.cwd()}/../..`;
const TILE = 512;

/**
 * ADR-056 — the crop rectangle is no longer drawn, and that is deliberate.
 *
 * It used to draw `FAKE_FACE_DETECTOR`'s hardcoded box, which was honest only for a *stubbed*
 * recording. Once the seed is recorded with the real detector (ADR-054) that box is fiction, and a
 * rectangle drawn in the wrong place is worse than no rectangle: it invites exactly the kind of
 * confident wrong conclusion this script exists to prevent. The dump stores sprites, not crops, so
 * the true box is not recoverable here — the sprite beside its source is the evidence, and where the
 * crop landed is plain from looking at the two.
 */

type Rgba = [number, number, number, number];

interface Bitmap {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

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
    const body = file.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colourType = body[9] ?? 6;
    }
    if (type === 'IDAT') parts.push(body);
    if (type === 'IEND') break;
    pos += 12 + length;
  }
  const channels = colourType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const previous = Buffer.alloc(stride);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[at];
    at += 1;
    const line = Buffer.from(raw.subarray(at, at + stride));
    at += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? (line[i - channels] ?? 0) : 0;
      const up = previous[i] ?? 0;
      const upLeft = i >= channels ? (previous[i - channels] ?? 0) : 0;
      const value = line[i] ?? 0;
      if (filter === 1) line[i] = (value + left) & 0xff;
      else if (filter === 2) line[i] = (value + up) & 0xff;
      else if (filter === 3) line[i] = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const dl = Math.abs(p - left);
        const du = Math.abs(p - up);
        const dul = Math.abs(p - upLeft);
        const best = dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
        line[i] = (value + best) & 0xff;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      pixels[to] = line[from] ?? 0;
      pixels[to + 1] = line[from + 1] ?? 0;
      pixels[to + 2] = line[from + 2] ?? 0;
      pixels[to + 3] = channels === 4 ? (line[from + 3] ?? 255) : 255;
    }
    line.copy(previous);
  }
  return { width, height, pixels };
}

function chunk(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, 'ascii');
  const typed = Buffer.concat([header.subarray(4), body]);
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(crc32(typed) >>> 0, 0);
  return Buffer.concat([header, body, trailer]);
}

function encodePng(bitmap: Bitmap): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bitmap.width, 0);
  ihdr.writeUInt32BE(bitmap.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = bitmap.width * 4;
  const raw = Buffer.alloc((stride + 1) * bitmap.height);
  for (let y = 0; y < bitmap.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(bitmap.pixels.subarray(y * stride, (y + 1) * stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blank(width: number, height: number): Bitmap {
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.fill(255);
  return { width, height, pixels };
}

function put(target: Bitmap, at: { x: number; y: number }, rgba: Rgba): void {
  const { x, y } = at;
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const to = (y * target.width + x) * 4;
  target.pixels[to] = rgba[0];
  target.pixels[to + 1] = rgba[1];
  target.pixels[to + 2] = rgba[2];
  target.pixels[to + 3] = rgba[3];
}

/** Nearest-neighbour, because the whole point is to see the pixels rather than smooth them away. */
function drawScaled(target: Bitmap, source: Bitmap, into: { x: number; y: number; size: number }): void {
  const { x: atX, y: atY, size } = into;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor((x * source.width) / size));
      const sy = Math.min(source.height - 1, Math.floor((y * source.height) / size));
      const from = (sy * source.width + sx) * 4;
      put(target, { x: atX + x, y: atY + y }, [
        source.pixels[from] ?? 0,
        source.pixels[from + 1] ?? 0,
        source.pixels[from + 2] ?? 0,
        255,
      ]);
    }
  }
}


/**
 * The sprite as an image. `parseAvatarSprite` returns `{ size, palette, rows }`, where `palette`
 * maps a hex DIGIT to a `#rrggbb` string and each row is a string of those digits.
 */
function spriteBitmap(code: string): Bitmap {
  const parsed = parseAvatarSprite(code);
  if (!parsed) throw new Error('unparseable sprite');
  const out = blank(parsed.size, parsed.size);
  for (const [y, row] of parsed.rows.entries()) {
    for (let x = 0; x < row.length; x += 1) {
      const hex = (parsed.palette[row[x] ?? '0'] ?? '#000000').slice(1);
      const value = Number.parseInt(hex, 16);
      put(out, { x, y }, [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 255]);
    }
  }
  return out;
}

interface Entry {
  sourceImage: string;
  nickname: string;
  /** ADR-056 — null when no face was found and the persona kept its drawn archetype. */
  avatarPhoto: string | null;
}

function main(): void {
  const count = Number(process.argv[2] ?? 6);
  // An offset, because the interesting photographs are rarely the first ones: the adversarial set
  // (`images/ingest/social/`) sits well down the persona list.
  const from = Number(process.argv[3] ?? 0);
  const dump = JSON.parse(readFileSync(`${ROOT}/scripts/demo-participants.dump.json`, 'utf8')) as {
    participants: Entry[];
  };
  const chosen = dump.participants.slice(from, from + count);

  const sheet = blank(TILE * 2 + 30, chosen.length * (TILE + 10));
  for (const [row, entry] of chosen.entries()) {
    const photo = decodePng(`${ROOT}/${entry.sourceImage}`);
    const top = row * (TILE + 10);

    // Left: the photograph as the pipeline received it.
    drawScaled(sheet, photo, { x: 0, y: top, size: TILE });

    // Right: the sprite the seed actually wears, or nothing when it wears an archetype.
    if (entry.avatarPhoto !== null) {
      drawScaled(sheet, spriteBitmap(entry.avatarPhoto), { x: TILE + 30, y: top, size: TILE });
    }
    console.log(
      `${entry.nickname.padEnd(14)} ${entry.sourceImage.replace('images/ingest/', '')} ` +
        `(${photo.width}x${photo.height})${entry.avatarPhoto === null ? '  [archetype — no face found]' : ''}`,
    );
  }

  const out = `${ROOT}/docs/screenshot/avatar-align-check.png`;
  writeFileSync(out, encodePng(sheet));
  console.log(`\nsheet: ${out} (${sheet.width}x${sheet.height})`);
  console.log('left = source photograph; right = the sprite actually worn');
}

main();
