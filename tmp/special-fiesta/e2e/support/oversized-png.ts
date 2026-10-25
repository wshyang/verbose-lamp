import { randomBytes } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

/**
 * A byte read that cannot be undefined: `randomBytes(n)` always holds exactly `n` bytes, and
 * every index below is derived from a bound the caller checks. One narrowing helper rather than
 * an undefined-arm at each of the six reads (ADR-013's method).
 */
function byteAt(buffer: Buffer, index: number): number {
  return buffer[index] ?? 0;
}

/**
 * Builds a genuinely oversized PNG, for ADR-052's fitting ladder (e2e only).
 *
 * Why not just pad a corpus photo? Because bytes after a PNG's `IEND` chunk are ignored by every
 * decoder, so a padded file decodes to the *same* image every run — and since an oversized original
 * is archived as a RE-ENCODED copy, that copy is byte-identical each time and ADR-050's global
 * duplicate check correctly refuses it. The padding made the file big without making it different,
 * which is exactly the wrong shape for this test.
 *
 * Random pixel noise fixes both problems at once: it does not compress, so the PNG is genuinely
 * larger than the archive cap as *image data* rather than as trailing filler, and it is unique on
 * every call, so the re-encoded archive is unique too.
 */

function chunk(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, 'ascii');
  const typed = Buffer.concat([header.subarray(4), body]);
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(crc32(typed) >>> 0, 0);
  return Buffer.concat([header, body, trailer]);
}

/**
 * A large, unique, *photograph-like* image.
 *
 * The content matters as much as the size. Pure noise would make the file huge, but it also survives
 * downscaling — so the 1280 px served rendition would blow the 400 kB rendition cap and the upload
 * would fail for a reason that has nothing to do with the archive ladder. A smooth gradient with
 * low-amplitude dither is the opposite: high enough entropy at full resolution to defeat PNG
 * compression and clear the 12 MB cap, yet it averages back to a smooth gradient once downscaled, so
 * the served renditions stay small — which is how a real oversized photo behaves.
 */
export function oversizedNoisePng(edge = 4096): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(edge, 0);
  ihdr.writeUInt32BE(edge, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // Compression, filter and interlace methods: the only values PNG defines.
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // A per-run seed so two calls never produce the same image, and therefore never the same archive.
  const seed = randomBytes(3);
  const stride = edge * 3;
  const raw = Buffer.alloc((stride + 1) * edge);
  for (let y = 0; y < edge; y += 1) {
    const at = y * (stride + 1);
    raw[at] = 0; // filter: None
    const dither = randomBytes(stride);
    for (let x = 0; x < edge; x += 1) {
      const px = at + 1 + x * 3;
      // Smooth in both axes, plus ±7 of dither: invisible after downscaling, but enough
      // high-frequency detail that deflate cannot fold the full-resolution image away.
      // byteAt: randomBytes(n) always holds exactly n (ADR-013's method — the guarantee is
      // cited here, the undefined arm is not written at every read).
      raw[px] = (((x * 255) / edge + byteAt(seed, 0)) & 0xff) ^ (byteAt(dither, x * 3) & 0x07);
      raw[px + 1] = (((y * 255) / edge + byteAt(seed, 1)) & 0xff) ^ (byteAt(dither, x * 3 + 1) & 0x07);
      raw[px + 2] = ((((x + y) * 127) / edge + byteAt(seed, 2)) & 0xff) ^ (byteAt(dither, x * 3 + 2) & 0x07);
    }
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    // Level 1: the dither is there precisely to resist compression, so level 9 would only spend
    // time proving it.
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
