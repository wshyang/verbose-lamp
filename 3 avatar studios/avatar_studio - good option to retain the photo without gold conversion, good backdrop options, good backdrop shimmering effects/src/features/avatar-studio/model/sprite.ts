import type { AlphaMask, RgbaImage } from './types';

/**
 * Indexed avatar sprites, ported from the reference app's contracts (`sprites.ts`).
 *
 *   `<size>:<hex>,<hex>,…:<runs>` — a run is one palette hex digit followed by its
 *   length in exactly three base-36 digits. By construction of the photo pipeline
 *   the last two palette entries are backdrop and ink, so the subject matte is free.
 */
export interface IndexedSprite {
  readonly size: number;
  readonly palette: readonly string[];
  /** One palette index per cell, row-major. */
  readonly cells: Uint8Array;
}

const SPRITE_PATTERN = /^(\d{2,3}):([0-9a-f]{6}(?:,[0-9a-f]{6})*):((?:[0-9a-f][0-9a-z]{3})+)$/;
const MAX_COLOURS = 16;

function decodeRuns(runs: string, size: number, colours: number): Uint8Array | null {
  const cells = new Uint8Array(size * size);
  let at = 0;
  for (const [, key, length] of runs.matchAll(/([0-9a-f])([0-9a-z]{3})/g)) {
    const index = Number.parseInt(key, 16);
    const count = Number.parseInt(length, 36);
    if (index >= colours || at + count > cells.length) return null;
    cells.fill(index, at, at + count);
    at += count;
  }
  return at === cells.length ? cells : null;
}

/** Anything malformed returns null; callers decide whether that is an error. */
export function parseIndexedSprite(code: string): IndexedSprite | null {
  const match = SPRITE_PATTERN.exec(code);
  if (!match) return null;
  const size = Number(match[1]);
  const palette = match[2].split(',').map((hex) => `#${hex}`);
  if (size < 8 || palette.length > MAX_COLOURS) return null;
  const cells = decodeRuns(match[3], size, palette.length);
  return cells === null ? null : { size, palette, cells };
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Upscale by nearest neighbour so a 128-cell sprite keeps crisp pixel-art edges. */
export function spriteToImage(sprite: IndexedSprite, scale = 1): RgbaImage {
  const side = sprite.size * scale;
  const rgb = sprite.palette.map(hexToRgb);
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const cell = sprite.cells[Math.floor(y / scale) * sprite.size + Math.floor(x / scale)];
      data.set([...rgb[cell], 255], (y * side + x) * 4);
    }
  }
  return { width: side, height: side, data };
}

/** Subject = every cell that is neither backdrop nor ink (the last two palette slots). */
export function spriteToMatte(sprite: IndexedSprite, scale = 1): AlphaMask {
  const side = sprite.size * scale;
  const firstNonSubject = sprite.palette.length - 2;
  const data = new Uint8ClampedArray(side * side);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const cell = sprite.cells[Math.floor(y / scale) * sprite.size + Math.floor(x / scale)];
      data[y * side + x] = cell < firstNonSubject ? 255 : 0;
    }
  }
  return { width: side, height: side, data };
}
