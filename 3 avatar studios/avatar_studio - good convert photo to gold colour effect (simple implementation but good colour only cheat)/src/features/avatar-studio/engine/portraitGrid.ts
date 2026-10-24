import type { CropBox, IndexedSprite, PortraitGrid, RgbaImage } from '../types';

/**
 * ADDENDUM-017 — a portrait, reduced to a grid of cells.
 *
 * Two doors into the same room: a photograph, resampled over the face crop; and an
 * indexed sprite, read straight out of its palette. Both end up as the same shape, so
 * the gold studio downstream never has to know which one it was given.
 */

/**
 * The grid a portrait is drawn on.
 *
 * 128 cells across, the size the source app settled on for photo avatars: coarse enough
 * to read as a stylised portrait, fine enough that an eye is two cells and a mouth is
 * four.
 */
export const PORTRAIT_GRID_SIZE = 128;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The average of the patch, pulled toward its darkest sample.
 *
 * A plain average is what erases a face at this size: an eye is two cells across, and
 * averaging it with the cheek around it leaves a pale smudge. Mixing in the darkest
 * sample keeps lashes, nostrils, lips and the line of the jaw, which is what the eye
 * recognises a person by.
 */
function averagePatch(
  image: RgbaImage,
  fromX: number,
  fromY: number,
  cell: number
): readonly [number, number, number] {
  const step = Math.max(1, Math.floor(cell / 4));
  const total = [0, 0, 0];
  let darkest = [255, 255, 255];
  let darkestSum = 765;
  let count = 0;
  for (let y = fromY; y < fromY + cell; y += step) {
    for (let x = fromX; x < fromX + cell; x += step) {
      const px = clamp(Math.floor(x), 0, image.width - 1);
      const py = clamp(Math.floor(y), 0, image.height - 1);
      const at = (py * image.width + px) * 4;
      const sample = [image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0];
      total[0] += sample[0];
      total[1] += sample[1];
      total[2] += sample[2];
      const sum = sample[0] + sample[1] + sample[2];
      if (sum < darkestSum) {
        darkestSum = sum;
        darkest = sample;
      }
      count += 1;
    }
  }
  const pull = 0.3;
  return [
    (total[0] / count) * (1 - pull) + darkest[0] * pull,
    (total[1] / count) * (1 - pull) + darkest[1] * pull,
    (total[2] / count) * (1 - pull) + darkest[2] * pull,
  ];
}

/**
 * A photograph, cropped to the face and resampled onto the portrait grid.
 *
 * The ground behind the sitter is left in place: the studio decides what to do with it
 * once the matte has had its say.
 */
export function gridFromCrop(
  image: RgbaImage,
  crop: CropBox,
  size: number = PORTRAIT_GRID_SIZE
): PortraitGrid {
  const colours = new Uint8Array(size * size * 3);
  const background = new Uint8Array(size * size);
  const cell = crop.size / size;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const fromX = crop.x + column * cell;
      const fromY = crop.y + row * cell;
      const sample = averagePatch(image, fromX, fromY, cell);
      const at = row * size + column;
      colours[at * 3] = Math.round(sample[0]);
      colours[at * 3 + 1] = Math.round(sample[1]);
      colours[at * 3 + 2] = Math.round(sample[2]);
    }
  }
  return { size, background, colours };
}

function channelsOf(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  if (!Number.isFinite(value)) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * A stored sprite, read back as a portrait grid.
 *
 * The palette of a photo sprite is `[...photo colours, backdrop, ink]` by construction,
 * so the ground is the second-to-last entry and the ink contour belongs to the sitter.
 * That is the one deviation from the source app, which counted the ink as ground when
 * it tested the matte — here the contour is the edge of the person and is kept.
 */
export function gridFromSprite(sprite: IndexedSprite): PortraitGrid {
  const size = sprite.size;
  const colours = new Uint8Array(size * size * 3);
  const background = new Uint8Array(size * size);
  const backdropIndex = sprite.palette.length - 2;
  for (let row = 0; row < size; row += 1) {
    const line = sprite.rows[row] ?? '';
    for (let column = 0; column < size; column += 1) {
      const index = Number.parseInt(line.charAt(column), 16);
      const at = row * size + column;
      const rgb = channelsOf(sprite.palette[index] ?? '#000000');
      colours[at * 3] = rgb[0];
      colours[at * 3 + 1] = rgb[1];
      colours[at * 3 + 2] = rgb[2];
      background[at] = index === backdropIndex ? 1 : 0;
    }
  }
  return { size, background, colours };
}

/** The grid with every cell counted as the sitter — the cut-out turned off. */
export function keepEverything(size: number): PortraitGrid['background'] {
  return new Uint8Array(size * size);
}

/**
 * The grid brought onto another size, by nearest sample.
 *
 * A stored sprite may be 64 cells across where a photograph is 128, and the studio
 * draws both on the same plate — so both are brought to one size before anything else
 * looks at them.
 */
export function resizeGrid(grid: PortraitGrid, size: number): PortraitGrid {
  if (grid.size === size) return grid;
  const colours = new Uint8Array(size * size * 3);
  const background = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const fromY = Math.min(grid.size - 1, Math.floor(((y + 0.5) * grid.size) / size));
    for (let x = 0; x < size; x += 1) {
      const fromX = Math.min(grid.size - 1, Math.floor(((x + 0.5) * grid.size) / size));
      const from = fromY * grid.size + fromX;
      const at = y * size + x;
      background[at] = grid.background[from] ?? 0;
      colours[at * 3] = grid.colours[from * 3] ?? 0;
      colours[at * 3 + 1] = grid.colours[from * 3 + 1] ?? 0;
      colours[at * 3 + 2] = grid.colours[from * 3 + 2] ?? 0;
    }
  }
  return { size, background, colours };
}
