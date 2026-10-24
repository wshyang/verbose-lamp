import { GOLD_RAMPS, buildGoldRampLut } from '@/features/gilded-portrait';
import type { AlphaMask, RgbaImage } from '@/shared/lib/raster';
import { lumaOf, mixRgb, parseHexColour, rampColour, scaleRgb, type Rgb } from './colour';
import { LEAF_SEED, fleckAt, leafAt } from './goldLeaf';
import { REFERENCE_GRID, bandOf, edgeDistance, fieldAt } from './patterns';
import type { BackdropSpec } from './types';

/**
 * The cloisonné / gilt-enamel panel (ADDENDUM-017 §3.3): every band is a field of coloured
 * enamel, every band boundary a raised gold wire, the enamel flecked with gold leaf and
 * glazed toward gold, the whole panel lit by a soft radial highlight. ADDENDUM-019 adds
 * B's jewel options: multi-tone enamels, hammered gold-leaf bands and guilloché. With
 * those left at their defaults, output is byte-identical to the ADDENDUM-018 renderer.
 *
 * Besides the image it returns the wire coverage and a "metal" map (how polished each
 * pixel is), so a host can animate light across the gold without touching the enamel.
 */
export interface EnamelPanel {
  readonly image: RgbaImage;
  readonly wire: AlphaMask;
  readonly metal: AlphaMask;
}

interface PanelContext {
  readonly spec: BackdropSpec;
  readonly size: number;
  readonly ramp: Uint8Array;
  readonly enamels: readonly Rgb[];
  readonly halfWire: number;
  readonly guilloche: number;
  readonly isLeafInlay: boolean;
}

interface PixelSample {
  readonly x: number;
  readonly y: number;
  readonly field: number;
  readonly gradient: number;
}

interface PanelBuffers {
  readonly image: Uint8ClampedArray;
  readonly wire: Uint8ClampedArray;
  readonly metal: Uint8ClampedArray;
}

interface UnitPoint {
  readonly u: number;
  readonly v: number;
  readonly edgePx: number;
}

interface Surface {
  readonly colour: Rgb;
  readonly polish: number;
}

/** How much of the glaze the gilt knob can apply: at 1 the enamel is still visibly coloured. */
const GLAZE_CEILING = 0.62;
/** Engine-turned rings per panel radius, and how deeply they modulate the enamel. */
const GUILLOCHE_RINGS = 38;
const GUILLOCHE_DEPTH = 0.16;
const HAMMER_SCALE = 140;

/** Colour at t along a multi-stop gradient; two stops reduce exactly to `mixRgb`. */
function gradientColour(stops: readonly Rgb[], t: number): Rgb {
  if (stops.length === 2) return mixRgb(stops[0], stops[1], t);
  const scaled = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mixRgb(stops[index], stops[index + 1], scaled - index);
}

function bandEnamels(spec: BackdropSpec, ramp: Uint8Array): Rgb[] {
  const stops = [spec.colourOne, ...(spec.accents ?? []), spec.colourTwo].map(parseHexColour);
  return Array.from({ length: spec.bands }, (_, band) => {
    const enamel = gradientColour(stops, spec.bands > 1 ? band / (spec.bands - 1) : 0);
    const gold = rampColour(ramp, 0.35 + 0.55 * lumaOf(enamel));
    return mixRgb(enamel, gold, spec.gilt * GLAZE_CEILING);
  });
}

function panelContext(spec: BackdropSpec, size: number): PanelContext {
  const ramp = buildGoldRampLut(GOLD_RAMPS[spec.rampId].stops);
  const halfWire = (Math.max(0, spec.wireWidth) / 2) * (size / REFERENCE_GRID);
  const guilloche = Math.min(1, Math.max(0, spec.guilloche ?? 0));
  return { spec, size, ramp, enamels: bandEnamels(spec, ramp), halfWire, guilloche, isLeafInlay: spec.inlay === 'gilded-bands' };
}

function fieldPlane(spec: BackdropSpec, size: number): Float64Array {
  const frame = { size, bands: spec.bands };
  const plane = new Float64Array(size * size);
  for (let pixel = 0; pixel < plane.length; pixel += 1) {
    plane[pixel] = fieldAt({ x: pixel % size, y: Math.floor(pixel / size) }, frame, spec.pattern);
  }
  return plane;
}

/** Of the two one-sided differences, the smaller: a seam where the field jumps by whole bands is skipped. */
function gentlerStep(before: number | null, after: number | null): number {
  if (before === null) return after ?? 0;
  if (after === null) return before;
  return Math.abs(before) < Math.abs(after) ? before : after;
}

function gradientAt(plane: Float64Array, size: number, point: { x: number; y: number }): number {
  const at = point.y * size + point.x;
  const here = plane[at];
  const gx = gentlerStep(point.x > 0 ? here - plane[at - 1] : null, point.x < size - 1 ? plane[at + 1] - here : null);
  const gy = gentlerStep(point.y > 0 ? here - plane[at - size] : null, point.y < size - 1 ? plane[at + size] - here : null);
  return Math.hypot(gx, gy);
}

/** Soft key light from the upper left, 0.72–1.12. */
function radialLight(u: number, v: number): number {
  const distance = Math.min(1, Math.hypot(u - 0.38, v - 0.32) / 0.85);
  return 0.72 + 0.4 * (1 - distance * distance * (3 - 2 * distance));
}

/** Bevel profile across a wire: brightest on its crest, darker at its foot. */
function wireBrightness(edgePx: number, halfWire: number): number {
  const crest = 1 - Math.min(1, edgePx / Math.max(halfWire, 1e-6));
  return 0.4 + 0.5 * Math.sqrt(crest) + (crest > 0.75 ? 0.08 : 0);
}

/** Engine-turned rings, phase-shifted across each band (B's guilloché). Exactly 1 when off. */
function guillocheFactor(ctx: PanelContext, point: UnitPoint, across: number): number {
  if (ctx.guilloche <= 0) return 1;
  const radial = Math.hypot(point.u - 0.5, point.v - 0.5) * 2;
  return 1 + GUILLOCHE_DEPTH * ctx.guilloche * Math.sin(radial * Math.PI * GUILLOCHE_RINGS + across * 6);
}

/** Hammered gold leaf, laid into every other band in the gilded-bands inlay (B's metalwork). */
function hammeredLeaf(ctx: PanelContext, point: UnitPoint, across: number): Rgb {
  const hammer = leafAt(point.u * HAMMER_SCALE, point.v * HAMMER_SCALE, LEAF_SEED + 13);
  return rampColour(ctx.ramp, 0.46 + 0.2 * hammer + 0.12 * Math.sin(Math.PI * across));
}

function surfaceAt(ctx: PanelContext, field: number, point: UnitPoint): Surface {
  const band = bandOf(field, ctx.spec.bands);
  const across = field - Math.floor(field);
  if (ctx.isLeafInlay && band % 2 === 1) return { colour: hammeredLeaf(ctx, point, across), polish: 0.85 };
  const recess = 0.86 + 0.14 * Math.min(1, point.edgePx / Math.max(ctx.halfWire * 4, 1));
  return { colour: scaleRgb(ctx.enamels[band], recess * guillocheFactor(ctx, point, across)), polish: ctx.spec.gilt * 0.3 };
}

function paintPixel(ctx: PanelContext, sample: PixelSample, out: PanelBuffers): void {
  const { spec, size, ramp, halfWire } = ctx;
  const u = (sample.x + 0.5) / size;
  const v = (sample.y + 0.5) / size;
  const edgePx = edgeDistance(sample.field) / Math.max(sample.gradient, 1e-9);
  const surface = surfaceAt(ctx, sample.field, { u, v, edgePx });
  const fleck = fleckAt({ u, v }, spec.leafDensity);
  const leafed = mixRgb(surface.colour, rampColour(ramp, 0.7 + 0.25 * fleck), fleck * 0.92);
  const coverage = Math.min(1, Math.max(0, halfWire - edgePx + 0.5));
  const wired = coverage > 0 ? mixRgb(leafed, rampColour(ramp, wireBrightness(edgePx, halfWire)), coverage) : leafed;
  const lit = scaleRgb(wired, radialLight(u, v));
  const pixel = sample.y * size + sample.x;
  out.image.set([Math.round(lit[0]), Math.round(lit[1]), Math.round(lit[2]), 255], pixel * 4);
  out.wire[pixel] = Math.round(coverage * 255);
  out.metal[pixel] = Math.round(Math.max(coverage, fleck * 0.9, surface.polish) * 255);
}

function assertPanelSize(size: number): void {
  if (!Number.isInteger(size) || size <= 0) throw new RangeError('Backdrop size must be a positive integer.');
}

export function renderEnamelPanel(spec: BackdropSpec, size: number): EnamelPanel {
  assertPanelSize(size);
  const ctx = panelContext(spec, size);
  const plane = fieldPlane(spec, size);
  const out: PanelBuffers = {
    image: new Uint8ClampedArray(size * size * 4),
    wire: new Uint8ClampedArray(size * size),
    metal: new Uint8ClampedArray(size * size),
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      paintPixel(ctx, { x, y, field: plane[y * size + x], gradient: gradientAt(plane, size, { x, y }) }, out);
    }
  }
  const dims = { width: size, height: size };
  return { image: { ...dims, data: out.image }, wire: { ...dims, data: out.wire }, metal: { ...dims, data: out.metal } };
}

export function renderEnamelBackdrop(spec: BackdropSpec, size: number): RgbaImage {
  return renderEnamelPanel(spec, size).image;
}
