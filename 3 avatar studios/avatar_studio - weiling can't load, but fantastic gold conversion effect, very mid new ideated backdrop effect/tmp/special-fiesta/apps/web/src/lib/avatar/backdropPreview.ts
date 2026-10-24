import type { AvatarBackdropPattern } from '@psd/contracts';
import { paintSpriteSunburst } from '../avatars.js';
import { required } from '../required.js';
import type { CutOutTuning } from './cutOut.js';
import { backgroundCells, preparePhotoCells } from './photoSprite.js';
import type { Bitmap, SubjectMask } from './types.js';

/**
 * ADR-224 — the photograph the cropper shows, with the chosen backdrop behind the person.
 *
 * The square cropper showed the raw photograph, while the thumbnail beside the characters showed the
 * same photograph cut out onto the backdrop. This paints the cut-out across the whole frame, so the crop
 * square sits on the picture that will be saved.
 *
 * Shared with the saved sprite: the background decision (`backgroundCells`, the function `paintPrepared`
 * calls) and the backdrop pattern (`paintSpriteSunburst`, the function that lays the pattern onto a photo
 * sprite).
 *
 * Not shared, and said plainly: the saved sprite decides inside the crop square on a 128-cell grid, while
 * this decides over the whole frame. Where the square's edge would change what the matte or the colour
 * rules decide, the two can differ. The frame is resampled onto a square grid first, because the cut-out
 * rules are written for square grids. The picture itself keeps the photograph's own pixels wherever the
 * person is, so it is not blocky.
 */

/** The side the frame is resampled to before the background is decided. Finer than the sprite's grid, so the matte's edge is not stair-stepped. */
export const PREVIEW_DECISION_SIDE = 256;

/** One character per kind of cell, because a sprite row is a string of palette keys. */
const SUBJECT_KEY = 's';
const BACKDROP_KEY = 'b';
const INK_KEY = 'i';

export interface BackdropPreviewInput {
  subject: SubjectMask | null;
  tuning: CutOutTuning;
  backdrop: string;
  sunburst: AvatarBackdropPattern | null;
}

/**
 * The photograph with the backdrop behind the person, at the photograph's own size.
 *
 * Returns null when the cut-out is off. The saved sprite is then the whole photograph, so the raw
 * photograph is already the right picture and there is nothing to paint.
 */
export function backdropPreview(bitmap: Bitmap, input: BackdropPreviewInput): Bitmap | null {
  if (!input.tuning.removeBackground) return null;
  const side = PREVIEW_DECISION_SIDE;
  const prepared = preparePhotoCells(stretchBitmap(bitmap, side), { x: 0, y: 0, size: side });
  const background = backgroundCells(prepared, {
    subject: input.subject === null ? null : stretchSubject(input.subject, side),
    tuning: input.tuning,
  });
  const grid = prepared.size;
  const rows: string[] = [];
  for (let y = 0; y < grid; y += 1) {
    let row = '';
    for (let x = 0; x < grid; x += 1) {
      const isBackdrop = required(background[y * grid + x], 'backdrop cell') === 1;
      row += isBackdrop ? BACKDROP_KEY : SUBJECT_KEY;
    }
    rows.push(row);
  }
  // The same grid-of-keys shape the saved sprite is painted from, so the pattern is the same pattern.
  const painted = paintSpriteSunburst(
    {
      size: grid,
      palette: { [SUBJECT_KEY]: '#000000', [BACKDROP_KEY]: input.backdrop, [INK_KEY]: '#000000' },
      rows,
    },
    input.sunburst,
  );
  return paintFrame(bitmap, painted.rows, painted.palette);
}

/**
 * Every cell of the grid, painted over the frame: the person keeps the photograph, and everything else
 * takes the backdrop colour, or the colour of its pattern band.
 */
function paintFrame(
  bitmap: Bitmap,
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): Bitmap {
  const grid = rows.length;
  const pixels = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
  const copy = pixelCopier(bitmap.pixels, pixels);
  for (let y = 0; y < bitmap.height; y += 1) {
    const row = required(rows[Math.min(grid - 1, Math.floor((y * grid) / bitmap.height))], 'grid row');
    for (let x = 0; x < bitmap.width; x += 1) {
      const at = (y * bitmap.width + x) * 4;
      const key = row.charAt(Math.min(grid - 1, Math.floor((x * grid) / bitmap.width)));
      if (key === SUBJECT_KEY) {
        copy(at, at);
      } else {
        const [red, green, blue] = rgbOf(required(palette[key], 'backdrop colour'));
        pixels.set([red, green, blue, 255], at);
      }
    }
  }
  return { width: bitmap.width, height: bitmap.height, pixels };
}

/**
 * Copies one RGBA pixel from one buffer to another, by index. A loop, because a view per pixel is an
 * allocation per pixel, and the frame has a few hundred thousand of them.
 */
function pixelCopier(from: Uint8ClampedArray, to: Uint8ClampedArray): (fromAt: number, toAt: number) => void {
  return (fromAt, toAt) => {
    for (let channel = 0; channel < 4; channel += 1) {
      to[toAt + channel] = required(from[fromAt + channel], 'photo pixel');
    }
  };
}

function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * The photograph resampled to a square by nearest sample. Stretched rather than cropped, because the
 * whole frame has to reach the decision: a crop would decide the background of part of the picture.
 */
export function stretchBitmap(bitmap: Bitmap, side: number): Bitmap {
  const pixels = new Uint8ClampedArray(side * side * 4);
  const copy = pixelCopier(bitmap.pixels, pixels);
  for (let y = 0; y < side; y += 1) {
    const from = Math.min(bitmap.height - 1, Math.floor(((y + 0.5) * bitmap.height) / side));
    for (let x = 0; x < side; x += 1) {
      const column = Math.min(bitmap.width - 1, Math.floor(((x + 0.5) * bitmap.width) / side));
      const source = (from * bitmap.width + column) * 4;
      copy(source, (y * side + x) * 4);
    }
  }
  return { width: side, height: side, pixels };
}

/** The matte resampled the same way, so the decision sees the same frame as the photograph does. */
export function stretchSubject(subject: SubjectMask, side: number): SubjectMask {
  const alpha = new Uint8Array(side * side);
  for (let y = 0; y < side; y += 1) {
    const from = Math.min(subject.height - 1, Math.floor(((y + 0.5) * subject.height) / side));
    for (let x = 0; x < side; x += 1) {
      const column = Math.min(subject.width - 1, Math.floor(((x + 0.5) * subject.width) / side));
      alpha[y * side + x] = required(subject.alpha[from * subject.width + column], 'matte pixel');
    }
  }
  return { width: side, height: side, alpha };
}
