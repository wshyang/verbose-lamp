import { buildGoldRampLut, GOLD_RAMPS } from '@/features/gilded-portrait';
import { ENAMEL_PALETTES } from '../data/backdropStyles';
import type { BackdropPatternId, BackdropStyle, RgbaImage } from './types';

/**
 * Gold-cloisonné backdrops — the gold re-imagining of the reference app's sunburst /
 * concentric / waves backdrop patterns (`sunburst.ts`, `concentric.ts`, `waves.ts`).
 *
 * The reference recoloured backdrop cells with flat bands. Here every band becomes a
 * piece of decorative metalwork: jewel enamel over engine-turned (guilloché) gold,
 * alternating with hammered gold leaf, separated by raised gold wires (cloisons) and
 * set in a stepped gold bezel. `phase` (0-1) moves the light across the metal, so a
 * sequence of phases is a shimmer loop.
 */

interface BandSample {
  /** Which band the pixel sits in. */
  readonly band: number;
  /** 0-1 position across the band; cloisons sit near 0 and 1. */
  readonly t: number;
  /** A secondary coordinate for ring wires / texture (0-1-ish). */
  readonly radial: number;
}

type PatternFn = (u: number, v: number, style: BackdropStyle) => BandSample;

const TAU = Math.PI * 2;
const fract = (value: number) => value - Math.floor(value);

function split(value: number): { band: number; t: number } {
  return { band: Math.floor(value), t: fract(value) };
}

const PATTERNS: Readonly<Record<BackdropPatternId, PatternFn>> = {
  sunburst: (u, v, style) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const radius = Math.hypot(dx, dy);
    const angle = fract((Math.atan2(dy, dx) + radius * style.twist) / TAU);
    return { ...split(angle * style.bands), radial: radius * 2 };
  },
  fan: (u, v, style) => {
    const dx = u - 0.5;
    const dy = 1.08 - v;
    const radius = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) / Math.PI;
    return { ...split(angle * style.bands), radial: radius * 3.2 };
  },
  concentric: (u, v, style) => {
    const radius = Math.hypot(u - 0.5, v - 0.5) / Math.SQRT1_2;
    return { ...split(radius * style.bands), radial: Math.atan2(v - 0.5, u - 0.5) / TAU + 0.5 };
  },
  waves: (u, v, style) => {
    const crest = v + 0.045 * Math.sin(u * TAU * 2.5) + 0.02 * Math.sin(u * TAU * 5.5 + 1.3);
    return { ...split(crest * style.bands), radial: u };
  },
  chevron: (u, v, style) => {
    const value = v + Math.abs(u - 0.5) * 0.9;
    return { ...split(value * style.bands * 0.7), radial: u };
  },
};

/** Cheap deterministic hash noise in 0-1, for hammered-leaf texture. */
export function hashNoise(x: number, y: number): number {
  const seed = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return fract(seed);
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

interface ShadeContext {
  readonly ramp: Uint8Array;
  readonly enamels: readonly (readonly [number, number, number])[];
  readonly phase: number;
}

/** Gold at a given brightness, read from the shared gilded-portrait ramp. */
function gold(ctx: ShadeContext, brightness: number): [number, number, number] {
  const index = Math.round(Math.min(1, Math.max(0, brightness)) * 255) * 3;
  return [ctx.ramp[index], ctx.ramp[index + 1], ctx.ramp[index + 2]];
}

/** A travelling specular glint: the light sweeps diagonally as phase advances. */
function glint(u: number, v: number, phase: number): number {
  const sweep = fract((u + v) * 0.5 - phase * 1.4);
  return Math.exp(-(((sweep - 0.5) / 0.08) ** 2));
}

function shadeEnamel(ctx: ShadeContext, sample: BandSample, light: number): [number, number, number] {
  const base = ctx.enamels[((sample.band % ctx.enamels.length) + ctx.enamels.length) % ctx.enamels.length];
  const guilloche = 0.5 + 0.5 * Math.sin(sample.radial * 90 + sample.t * 6);
  const glow = 0.68 + 0.3 * guilloche + 0.25 * light;
  const under = gold(ctx, 0.55 + 0.3 * light);
  return [0, 1, 2].map((c) => base[c] * glow * 0.82 + under[c] * 0.18) as [number, number, number];
}

function shadePixel(ctx: ShadeContext, sample: BandSample, uv: { u: number; v: number; x: number; y: number }) {
  const wire = Math.min(sample.t, 1 - sample.t);
  const light = glint(uv.u, uv.v, ctx.phase);
  if (wire < 0.06) {
    const bevel = 1 - wire / 0.06;
    return gold(ctx, 0.62 + 0.25 * bevel + 0.35 * light);
  }
  if (sample.band % 2 === 0) return shadeEnamel(ctx, sample, light);
  const hammer = hashNoise(Math.floor(uv.x / 3), Math.floor(uv.y / 3));
  const bead = Math.abs(fract(sample.radial * 6) - 0.5) < 0.04 ? 0.18 : 0;
  return gold(ctx, 0.42 + 0.18 * hammer + 0.12 * Math.sin(sample.t * Math.PI) + bead + 0.4 * light);
}

/** Stepped Art Deco bezel: three gold rings of decreasing brightness, inset from the edge. */
function bezelBrightness(u: number, v: number): number | null {
  const edge = Math.min(u, v, 1 - u, 1 - v);
  if (edge < 0.018) return 0.88;
  if (edge < 0.026) return 0.35;
  if (edge < 0.034) return 0.7;
  return null;
}

export interface BackdropRenderOptions {
  readonly size: number;
  readonly style: BackdropStyle;
  /** 0-1 position of the shimmer light. */
  readonly phase: number;
}

export function renderGoldBackdrop({ size, style, phase }: BackdropRenderOptions): RgbaImage {
  const ctx: ShadeContext = {
    ramp: buildGoldRampLut(GOLD_RAMPS.bright.stops),
    enamels: ENAMEL_PALETTES[style.palette].enamels.map(hexToRgb),
    phase,
  };
  const pattern = PATTERNS[style.pattern];
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const bezel = bezelBrightness(u, v);
      const rgb = bezel === null
        ? shadePixel(ctx, pattern(u, v, style), { u, v, x, y })
        : gold(ctx, bezel + 0.3 * glint(u, v, phase));
      data.set([rgb[0], rgb[1], rgb[2], 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}
