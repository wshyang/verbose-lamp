import { describe, expect, it } from 'vitest';
import { LAYER_TONES, brassAngleFor, toneForLayer } from './tone';

describe('LAYER_TONES', () => {
  it('darkens monotonically from the top layer to the bottom', () => {
    for (let layer = 1; layer < LAYER_TONES.length; layer += 1) {
      expect(LAYER_TONES[layer]).toBeLessThan(LAYER_TONES[layer - 1]);
    }
  });

  it('keeps every tone inside 0..1 with layer 0 at full brightness', () => {
    expect(LAYER_TONES[0]).toBe(1);
    for (const tone of LAYER_TONES) {
      expect(tone).toBeGreaterThan(0);
      expect(tone).toBeLessThanOrEqual(1);
    }
  });
});

describe('toneForLayer', () => {
  it.each([
    [0, 1],
    [1, 0.82],
    [2, 0.68],
    [3, 0.54],
  ])('maps layer %i to %f', (layer, tone) => {
    expect(toneForLayer(layer)).toBe(tone);
  });

  it('clamps layers outside the table instead of reading past it', () => {
    expect(toneForLayer(-4)).toBe(LAYER_TONES[0]);
    expect(toneForLayer(99)).toBe(LAYER_TONES[LAYER_TONES.length - 1]);
  });

  it('rounds a fractional layer to the nearest one', () => {
    expect(toneForLayer(1.4)).toBe(LAYER_TONES[1]);
    expect(toneForLayer(1.6)).toBe(LAYER_TONES[2]);
  });
});

describe('brassAngleFor', () => {
  it('is deterministic for a seed and layer', () => {
    expect(brassAngleFor(1925, 2)).toBe(brassAngleFor(1925, 2));
  });

  it('returns whole degrees in 0..360', () => {
    for (const seed of [0, 1, 1925, 77, 123456]) {
      for (const layer of [0, 1, 2, 3]) {
        const angle = brassAngleFor(seed, layer);
        expect(Number.isInteger(angle)).toBe(true);
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThanOrEqual(360);
      }
    }
  });

  it('tilts the light differently when the seed is rerolled', () => {
    const angles = [1925, 1926, 1927, 1928, 1929].map((seed) => brassAngleFor(seed, 1));

    expect(new Set(angles).size).toBeGreaterThan(1);
  });

  it('gives different layers of one seed their own tilt', () => {
    const angles = [0, 1, 2, 3].map((layer) => brassAngleFor(1925, layer));

    expect(new Set(angles).size).toBeGreaterThan(1);
  });

  // [103, 310, 147, 30] was recomputed outside the repo (Python port of hash01), not copied from a run.
  it('pins the shipped angles so a hash or stride change is a deliberate act', () => {
    expect([0, 1, 2, 3].map((layer) => brassAngleFor(1925, layer))).toMatchInlineSnapshot(`
      [
        103,
        310,
        147,
        30,
      ]
    `);
  });
});
