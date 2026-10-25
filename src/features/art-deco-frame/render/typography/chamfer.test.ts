import { describe, expect, it } from 'vitest';
import { chamferHeights, type MaskSurface } from './mask';

/**
 * The bevel arithmetic on a real mask. jsdom's canvas returns an empty one, so the structural
 * suites around the whole rig cannot see this code at all (every change to it left them green).
 * These feed it ink directly. The expected figures come from the unsplit function's own
 * arithmetic, run on the same masks before the split and compared output for output.
 */
function solid(width: number, height: number, ink: (x: number, y: number) => boolean): MaskSurface {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (ink(x, y)) data[(y * width + x) * 4 + 3] = 255;
  }
  return { data, width, height };
}

const at = (heights: Float32Array, width: number, x: number, y: number) => heights[y * width + x];

describe('chamferHeights', () => {
  it('is zero everywhere on an empty mask', () => {
    const heights = chamferHeights({ mask: solid(8, 8, () => false), strokeW: 32, scaleFit: 1 });

    expect(Array.from(heights).every((value) => value === 0)).toBe(true);
  });

  it('is zero on the border, which the sweeps never visit, and rises inside a solid block', () => {
    const heights = chamferHeights({ mask: solid(20, 20, () => true), strokeW: 32, scaleFit: 1 });

    expect(at(heights, 20, 0, 10)).toBeGreaterThan(0);
    expect(at(heights, 20, 10, 10)).toBeGreaterThanOrEqual(at(heights, 20, 1, 10));
  });

  it('measures distance from the edge: one step per pixel along an axis', () => {
    // A bar ten pixels tall on a canvas where the bevel cap is far above its half-height.
    const mask = solid(30, 21, (_x, y) => y >= 5 && y <= 15);
    const heights = chamferHeights({ mask, strokeW: 1000, scaleFit: 1 });
    const cap = Math.max(2, 1000 * 0.48);

    // Row 5 is the first ink row; the chamfer starts from the zero outside it.
    expect(at(heights, 30, 15, 5) * cap).toBeCloseTo(1, 5);
    expect(at(heights, 30, 15, 6) * cap).toBeCloseTo(2, 5);
    expect(at(heights, 30, 15, 10) * cap).toBeCloseTo(6, 5);
  });

  it('rises symmetrically from both sides of a bar, so the crest sits in the middle', () => {
    const mask = solid(30, 21, (_x, y) => y >= 5 && y <= 15);
    const heights = chamferHeights({ mask, strokeW: 1000, scaleFit: 1 });

    expect(at(heights, 30, 15, 5)).toBeCloseTo(at(heights, 30, 15, 15), 5);
    expect(at(heights, 30, 15, 6)).toBeCloseTo(at(heights, 30, 15, 14), 5);
    // Down the column through the middle of the bar the profile is 0 1 2 3 4 5 6 5 4 3 2 1 0.
    const column = Array.from({ length: 21 }, (_, y) => at(heights, 30, 15, y));
    expect(column.indexOf(Math.max(...column))).toBe(10);
  });

  it('counts a diagonal step as 1.414, not 2, at a corner', () => {
    const mask = solid(30, 30, (x, y) => x >= 10 && y >= 10);
    const heights = chamferHeights({ mask, strokeW: 1000, scaleFit: 1 });
    const cap = Math.max(2, 1000 * 0.48);

    expect(at(heights, 30, 10, 10) * cap).toBeCloseTo(1, 5);
    expect(at(heights, 30, 11, 11) * cap).toBeCloseTo(2, 5);
    // Two diagonal steps from the corner, reached through the diagonal neighbour.
    expect(at(heights, 30, 12, 12) * cap).toBeLessThan(3.2);
    expect(at(heights, 30, 12, 12) * cap).toBeGreaterThan(2.8);
  });

  it('caps the height at 1 once the bevel limit is reached', () => {
    const heights = chamferHeights({ mask: solid(60, 60, () => true), strokeW: 4, scaleFit: 1 });

    expect(Math.max(...Array.from(heights))).toBe(1);
    expect(Math.min(...Array.from(heights))).toBeGreaterThanOrEqual(0);
  });

  it('never lets the bevel limit fall below two pixels, so a hairline still has a slope', () => {
    // A bar three pixels thick, so the distances stay small enough not to saturate the cap.
    const bar = solid(20, 12, (_x, y) => y >= 4 && y <= 6);
    const heights = chamferHeights({ mask: bar, strokeW: 1, scaleFit: 0.1 });
    // strokeW * 0.48 * scaleFit is far under 2, so the divisor is the floor of 2: one pixel in is 1/2.
    expect(at(heights, 20, 10, 4)).toBeCloseTo(1 / 2, 5);
    expect(at(heights, 20, 10, 5)).toBe(1);
  });

  it('shrinks the bevel with the scale the word was fitted to', () => {
    // A bar whose half-thickness stays below both caps (15.4 and 7.7), so the slope is visible.
    const bar = solid(40, 21, (_x, y) => y >= 5 && y <= 15);
    const full = chamferHeights({ mask: bar, strokeW: 32, scaleFit: 1 });
    const fitted = chamferHeights({ mask: bar, strokeW: 32, scaleFit: 0.5 });

    expect(at(full, 40, 20, 6)).toBeCloseTo(2 / (32 * 0.48), 5);
    expect(at(fitted, 40, 20, 6)).toBeCloseTo(2 / (32 * 0.48 * 0.5), 5);
    expect(at(fitted, 40, 20, 6)).toBeGreaterThan(at(full, 40, 20, 6));
  });

  it('treats alpha at or below the 0.35 threshold as outside', () => {
    const mask = solid(10, 10, () => false);
    for (let i = 0; i < 100; i++) mask.data[i * 4 + 3] = Math.round(0.35 * 255);
    const outside = chamferHeights({ mask, strokeW: 32, scaleFit: 1 });
    for (let i = 0; i < 100; i++) mask.data[i * 4 + 3] = Math.round(0.36 * 255);
    const inside = chamferHeights({ mask, strokeW: 32, scaleFit: 1 });

    expect(Math.max(...Array.from(outside))).toBe(0);
    expect(Math.max(...Array.from(inside))).toBeGreaterThan(0);
  });
});

// Fixtures chosen so each step class is the only route to the answer: the numbers below were read
// from the unsplit arithmetic and checked by hand (a diagonal band three pixels either side of the
// diagonal; the pixel on the diagonal itself is the farthest, at two diagonal steps plus two axis ones).
describe('chamferHeights step classes', () => {
  const CAP = 1000 * 0.48;
  const band = (width: number, reach: number) =>
    solid(width, width, (x, y) => Math.abs(x - y) <= reach);
  const rowOf = (heights: Float32Array, width: number, y: number) =>
    Array.from({ length: width }, (_, x) => at(heights, width, x, y) * CAP);

  it('reads an exact distance profile across a diagonal band, through the diagonal neighbour', () => {
    const heights = chamferHeights({ mask: band(24, 3), strokeW: 1000, scaleFit: 1 });
    const profile = rowOf(heights, 24, 12).slice(9, 16);

    expect(profile[0]).toBeCloseTo(1, 3);
    expect(profile[1]).toBeCloseTo(1.414, 3);
    expect(profile[2]).toBeCloseTo(2.414, 3);
    expect(profile[3]).toBeCloseTo(2.828, 3);
    expect(profile[4]).toBeCloseTo(2.414, 3);
    expect(profile[5]).toBeCloseTo(1.414, 3);
    expect(profile[6]).toBeCloseTo(1, 3);
  });

  it('is mirror-symmetric about the band, which needs the forward and backward sweeps to agree', () => {
    const heights = chamferHeights({ mask: band(24, 3), strokeW: 1000, scaleFit: 1 });

    for (let offset = 1; offset <= 3; offset++) {
      expect(at(heights, 24, 12 - offset, 12)).toBeCloseTo(at(heights, 24, 12 + offset, 12), 5);
    }
  });

  it('treats alpha 89 as outside and 90 as inside (0.35 of 255 is 89.25)', () => {
    const alpha = (value: number) => {
      const mask = solid(8, 8, () => false);
      for (let i = 0; i < 64; i++) mask.data[i * 4 + 3] = value;
      return Math.max(...Array.from(chamferHeights({ mask, strokeW: 32, scaleFit: 1 })));
    };

    expect(alpha(89)).toBe(0);
    expect(alpha(90)).toBeGreaterThan(0);
  });

  it('runs a square block as one diagonal staircase of unit steps', () => {
    const mask = solid(30, 30, (x, y) => x >= 10 && x <= 20 && y >= 10 && y <= 20);
    const heights = chamferHeights({ mask, strokeW: 1000, scaleFit: 1 });

    expect([0, 1, 2, 3, 4, 5].map((i) => at(heights, 30, 10 + i, 10 + i) * CAP)).toEqual([1, 2, 3, 4, 5, 6].map((v) => expect.closeTo(v, 3)));
  });

  // An L-shaped block: at its inside corner the nearest edge is a single diagonal step away, so the
  // pixel reads 1.414 only if the diagonal neighbour is consulted. Nothing else in the suite reaches it.
  it('reaches the inside corner of an L through the diagonal neighbour', () => {
    const l = solid(12, 12, (x, y) => (x >= 2 && x <= 9 && y >= 2 && y <= 4) || (x >= 2 && x <= 4 && y >= 2 && y <= 9));
    const heights = chamferHeights({ mask: l, strokeW: 1000, scaleFit: 1 });

    expect(at(heights, 12, 4, 4) * CAP).toBeCloseTo(1.414, 3);
    expect(at(heights, 12, 3, 3) * CAP).toBeCloseTo(2, 3);
  });
});

