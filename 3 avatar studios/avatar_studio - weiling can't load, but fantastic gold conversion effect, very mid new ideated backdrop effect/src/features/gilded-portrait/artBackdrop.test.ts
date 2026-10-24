import { describe, expect, it } from 'vitest';
import { buildArtBackdrop, compositeImages } from './artBackdrop';
import type { RgbaImage } from './types';

describe('art backdrops', () => {
  it('combines colour fields with metallic gold linework', () => {
    const backdrop = buildArtBackdrop(32, 32, 'sapphire-fan');
    const colours = new Set<string>();
    for (let offset = 0; offset < backdrop.data.length; offset += 4) {
      colours.add(`${backdrop.data[offset]},${backdrop.data[offset + 1]},${backdrop.data[offset + 2]}`);
    }
    expect(colours.size).toBeGreaterThan(5);
    expect(colours.has('218,177,61')).toBe(true);
  });

  it('places a transparent gold subject over the art', () => {
    const foreground: RgbaImage = { width: 1, height: 1, data: Uint8ClampedArray.of(240, 200, 80, 0) };
    const background: RgbaImage = { width: 1, height: 1, data: Uint8ClampedArray.of(10, 30, 60, 255) };
    expect([...compositeImages(foreground, background).data]).toEqual([10, 30, 60, 255]);
  });
});