import { describe, expect, it } from 'vitest';
import { BACKDROP_PRESETS, DEFAULT_BACKDROPS, ENAMEL_PALETTES, JEWEL_BACKDROPS } from './palettes';
import { bandOf, fieldAt } from './patterns';
import { renderEnamelBackdrop, renderEnamelPanel } from './renderBackdrop';
import type { BackdropSpec } from './types';

const [emeraldSunburst, sapphireRadiance] = DEFAULT_BACKDROPS;

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const delta = max - min;
  const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
}

function hexHue(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return hueOf((value >> 16) & 255, (value >> 8) & 255, value & 255);
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const lumaAt = (data: ArrayLike<number>, pixel: number) => data[pixel * 4] * 0.2126 + data[pixel * 4 + 1] * 0.7152 + data[pixel * 4 + 2] * 0.0722;
const bandAt = (spec: BackdropSpec, size: number) => (pixel: number) =>
  bandOf(fieldAt({ x: pixel % size, y: Math.floor(pixel / size) }, { size, bands: spec.bands }, spec.pattern), spec.bands);

/** Rows of hex so the snapshot is reviewable data, not a screen capture. */
function asHexRows(data: ArrayLike<number>, size: number): string[] {
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size * 4 }, (_, i) => data[y * size * 4 + i].toString(16).padStart(2, '0')).join(''));
}

describe('renderEnamelBackdrop', () => {
  it('is deterministic', () => {
    const first = renderEnamelBackdrop(emeraldSunburst.spec, 48);
    const second = renderEnamelBackdrop(emeraldSunburst.spec, 48);
    expect(Array.from(first.data)).toEqual(Array.from(second.data));
    expect(first.width).toBe(48);
  });

  it('paints every full-coverage wire pixel in warm gold (R ≥ G ≥ B), for every style', () => {
    for (const { spec } of BACKDROP_PRESETS) {
      const panel = renderEnamelPanel({ ...spec, wireWidth: 1.6 }, 192);
      let wires = 0;
      for (let pixel = 0; pixel < panel.wire.data.length; pixel += 1) {
        if (panel.wire.data[pixel] !== 255) continue;
        wires += 1;
        const [r, g, b] = panel.image.data.slice(pixel * 4, pixel * 4 + 3);
        expect(r).toBeGreaterThanOrEqual(g);
        expect(g).toBeGreaterThanOrEqual(b);
      }
      expect(wires).toBeGreaterThan(100);
    }
  });

  it('keeps each enamel band in its hue family', () => {
    const spec: BackdropSpec = { ...sapphireRadiance.spec, leafDensity: 0 };
    const panel = renderEnamelPanel(spec, 128);
    const family = hexHue(spec.colourOne);
    let checked = 0;
    for (let pixel = 0; pixel < panel.wire.data.length; pixel += 1) {
      if (panel.metal.data[pixel] > Math.round(spec.gilt * 0.3 * 255)) continue;
      const [r, g, b] = panel.image.data.slice(pixel * 4, pixel * 4 + 3);
      expect(hueGap(hueOf(r, g, b), family)).toBeLessThan(30);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('shifts colours toward gold as gilt rises', () => {
    const warmth = (gilt: number) => {
      const data = renderEnamelBackdrop({ ...sapphireRadiance.spec, leafDensity: 0, gilt }, 64).data;
      let total = 0;
      for (let at = 0; at < data.length; at += 4) total += data[at] - data[at + 2];
      return total;
    };
    expect(warmth(1)).toBeGreaterThan(warmth(0.5));
    expect(warmth(0.5)).toBeGreaterThan(warmth(0));
  });

  it('matches the 16×16 data snapshot of every default preset', () => {
    for (const preset of DEFAULT_BACKDROPS) {
      expect(asHexRows(renderEnamelBackdrop(preset.spec, 16).data, 16)).toMatchSnapshot(preset.id);
    }
  });

  it('rejects impossible sizes', () => {
    expect(() => renderEnamelBackdrop(emeraldSunburst.spec, 0)).toThrow(RangeError);
  });
});

describe('jewel finishes lifted from implementation B (ADDENDUM-019)', () => {
  const size = 96;

  it('gives each band of a four-tone palette its own enamel', () => {
    const peacock = ENAMEL_PALETTES.find((palette) => palette.id === 'peacock')!;
    const spec: BackdropSpec = { ...JEWEL_BACKDROPS[2].spec, colourOne: peacock.colourOne, colourTwo: peacock.colourTwo, accents: peacock.accents, leafDensity: 0, guilloche: 0 };
    const panel = renderEnamelPanel(spec, size);
    const band = bandAt(spec, size);
    const sums = Array.from({ length: spec.bands }, () => [0, 0, 0, 0]);
    for (let pixel = 0; pixel < size * size; pixel += 1) {
      if (panel.wire.data[pixel] > 0) continue;
      const totals = sums[band(pixel)];
      for (let channel = 0; channel < 3; channel += 1) totals[channel] += panel.image.data[pixel * 4 + channel];
      totals[3] += 1;
    }
    const means = sums.map(([r, g, b, n]) => [r / n, g / n, b / n]);
    for (let first = 0; first < means.length; first += 1) {
      for (let second = first + 1; second < means.length; second += 1) {
        expect(Math.hypot(...means[first].map((value, channel) => value - means[second][channel]))).toBeGreaterThan(15);
      }
    }
  });

  it('lays hammered warm gold leaf into every other band', () => {
    const spec: BackdropSpec = { ...JEWEL_BACKDROPS[0].spec, leafDensity: 0 };
    const panel = renderEnamelPanel(spec, size);
    const band = bandAt(spec, size);
    let leafPixels = 0;
    for (let pixel = 0; pixel < size * size; pixel += 1) {
      if (band(pixel) % 2 === 0) continue;
      const [r, g, b] = panel.image.data.slice(pixel * 4, pixel * 4 + 3);
      expect(r >= g && g >= b).toBe(true);
      leafPixels += 1;
    }
    expect(leafPixels).toBeGreaterThan(1500);
  });

  it('adds engine-turned guilloché variation to the enamel', () => {
    const spread = (guilloche: number) => {
      const panel = renderEnamelPanel({ ...JEWEL_BACKDROPS[2].spec, leafDensity: 0, guilloche }, size);
      const values = Array.from({ length: size * size }, (_, pixel) => pixel).filter((pixel) => panel.wire.data[pixel] === 0).map((pixel) => lumaAt(panel.image.data, pixel));
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    };
    expect(spread(0.9)).toBeGreaterThan(spread(0) * 1.05);
  });
});

describe('renderEnamelBackdrop degenerate sizes', () => {
  it('renders a single pixel, where the gradient has no neighbours', () => {
    const pixel = renderEnamelBackdrop(emeraldSunburst.spec, 1);
    expect(pixel.data).toHaveLength(4);
    expect(pixel.data[3]).toBe(255);
  });

  it('renders a single-band spec as one flat enamel', () => {
    const flat = renderEnamelBackdrop({ ...emeraldSunburst.spec, bands: 1 }, 8);
    expect(flat.data).toHaveLength(8 * 8 * 4);
  });
});
