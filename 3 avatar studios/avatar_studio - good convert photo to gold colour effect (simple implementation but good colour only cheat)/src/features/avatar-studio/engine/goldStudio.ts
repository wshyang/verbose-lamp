import { buildGoldRampLut, GOLD_RAMPS } from '@/features/gilded-portrait';
import { bandIndexOf } from './backdropArt';
import type { GoldStudioOptions, PortraitGrid, RgbaImage } from '../types';

/**
 * ADDENDUM-017 — the gold plate, and the art laid into it.
 *
 * The source app painted its backdrops with flat psychedelic colour and nothing else.
 * This house gilds everything, so the same artwork is now inlaid into a gold plate: the
 * bands carry enamel, the plate carries gold, and a specular sweep crosses both the way
 * light crosses a finished piece of metalwork.
 *
 * The geometry is the source app's, unchanged. The paint is ours.
 */

type Rgb = readonly [number, number, number];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  if (!Number.isFinite(value)) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(base: Rgb, over: Rgb, amount: number): Rgb {
  const share = clamp01(amount);
  return [
    base[0] + (over[0] - base[0]) * share,
    base[1] + (over[1] - base[1]) * share,
    base[2] + (over[2] - base[2]) * share,
  ];
}

function luminance(colour: Rgb): number {
  return (colour[0] * 0.2126 + colour[1] * 0.7152 + colour[2] * 0.0722) / 255;
}

/** The gold the house uses for a given brightness. */
function rampAt(ramp: Uint8Array, position: number): Rgb {
  const index = Math.round(clamp01(position) * 255) * 3;
  return [ramp[index] ?? 0, ramp[index + 1] ?? 0, ramp[index + 2] ?? 0];
}

/**
 * How much of a band is gold rather than enamel.
 *
 * Even bands are inlaid — the art is the point of those — and odd bands are gilded, so
 * the artwork reads as alternating enamel and metal, the way a cloisonné piece does.
 */
export function bandGoldShare(band: number): number {
  return band % 2 === 0 ? 0.28 : 0.88;
}

/** The ground of one cell: enamel, lifted toward gold by the band and the gold share. */
function groundColour(
  band: number,
  enamel: readonly Rgb[],
  ramp: Uint8Array,
  options: GoldStudioOptions
): Rgb {
  const art = enamel[band % Math.max(1, enamel.length)] ?? [0, 0, 0];
  const gold = rampAt(ramp, luminance(art));
  return mix(art, gold, options.goldShare * bandGoldShare(band));
}

/** The sitter, gilded when the house asks for it and left in their own colours otherwise. */
function sitterColour(colour: Rgb, ramp: Uint8Array, options: GoldStudioOptions): Rgb {
  if (!options.gildSubject) return colour;
  return mix(colour, rampAt(ramp, luminance(colour)), 0.85);
}

/** How far a cell is from the edge of the plate. */
export function edgeDistance(x: number, y: number, size: number): number {
  return Math.min(x, y, size - 1 - x, size - 1 - y);
}

/**
 * The specular sweep, as a diagonal band across the plate.
 *
 * It is a function of the cell's place in the grid and the shimmer phase, so moving the
 * phase moves the highlight the way a lamp moves across a finished piece.
 */
export function sheenAt(
  x: number,
  y: number,
  size: number,
  phase: number
): number {
  const diagonal = (((x + y) / (2 * size)) + phase) % 1;
  return Math.max(0, 1 - Math.abs(diagonal - 0.5) * 5);
}

/** The raised rim of the plate: a dark gold outer edge and a bright bead inside it. */
function rimColour(
  x: number,
  y: number,
  size: number,
  ramp: Uint8Array,
  rimWidth: number
): Rgb | null {
  const distance = edgeDistance(x, y, size);
  if (distance >= rimWidth) return null;
  return rampAt(ramp, distance === 0 ? 0.2 : 0.94);
}

function cellColour(
  grid: PortraitGrid,
  at: number,
  x: number,
  y: number,
  enamel: readonly Rgb[],
  ramp: Uint8Array,
  options: GoldStudioOptions,
  rimWidth: number
): Rgb {
  const rim = options.rim ? rimColour(x, y, grid.size, ramp, rimWidth) : null;
  if (rim !== null) return rim;
  const source: Rgb = [
    grid.colours[at * 3] ?? 0,
    grid.colours[at * 3 + 1] ?? 0,
    grid.colours[at * 3 + 2] ?? 0,
  ];
  if (grid.background[at] === 1) {
    const band = bandIndexOf({ x, y }, grid.size, options.pattern);
    return groundColour(band, enamel, ramp, options);
  }
  return sitterColour(source, ramp, options);
}

/**
 * The finished plate: the portrait, its ground, the gold and the light on it.
 *
 * Everything here is arithmetic over cells, so the same portrait renders the same plate
 * on every machine and can be asserted on in a test.
 */
export function renderGoldStudio(
  grid: PortraitGrid,
  options: GoldStudioOptions
): RgbaImage {
  const ramp = buildGoldRampLut(GOLD_RAMPS[options.rampId].stops);
  const enamel = options.artColours.map(parseHex);
  const size = grid.size;
  const data = new Uint8ClampedArray(size * size * 4);
  const rimWidth = Math.max(1, Math.round(size * 0.035));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = y * size + x;
      const base = cellColour(grid, at, x, y, enamel, ramp, options, rimWidth);
      const specular = sheenAt(x, y, size, options.shimmerPhase) * options.sheen * 0.55;
      const highlight = rampAt(ramp, 0.98);
      const lit = mix(base, highlight, specular);
      data[at * 4] = Math.round(lit[0]);
      data[at * 4 + 1] = Math.round(lit[1]);
      data[at * 4 + 2] = Math.round(lit[2]);
      data[at * 4 + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}
