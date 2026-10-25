import { describe, expect, it } from 'vitest';
import { DECO_ALPHABET } from './decoAlphabet';

type Call =
  | { op: 'moveTo' | 'lineTo'; points: Array<{ x: number; y: number }> }
  | { op: 'arc'; centre: { x: number; y: number }; radius: number; start: number; end: number }
  | { op: 'closePath' };

/** Records the skeleton instead of rasterising it: the alphabet is pure geometry. */
function recorder() {
  const calls: Call[] = [];
  let cursor = { x: 0, y: 0 };
  return {
    calls,
    path: {
      moveTo: (x: number, y: number) => {
        cursor = { x, y };
        calls.push({ op: 'moveTo', points: [{ x, y }] });
      },
      lineTo: (x: number, y: number) => {
        calls.push({ op: 'lineTo', points: [{ x: cursor.x === x && cursor.y === y ? x : x, y }] });
        cursor = { x, y };
      },
      arc: (x: number, y: number, radius: number, start: number, end: number) => {
        calls.push({ op: 'arc', centre: { x, y }, radius, start, end });
      },
      closePath: () => calls.push({ op: 'closePath' }),
    } as unknown as Path2D,
  };
}

const GLYPHS = Object.entries(DECO_ALPHABET);
const HEIGHT = 100;
const EPSILON = 0.001;
/** Q's tail and a few flourishes deliberately cross the box by up to 5 %. */
const OVERSHOOT = 0.05;

describe('DECO_ALPHABET', () => {
  it('covers the full title alphabet, digits and the typographic marks the titles use', () => {
    const keys = new Set(Object.keys(DECO_ALPHABET));
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(keys.has(letter)).toBe(true);
    for (const digit of '0123456789') expect(keys.has(digit)).toBe(true);
    for (const mark of ['&', '.', '·', '-', "'"]) expect(keys.has(mark)).toBe(true);
  });

  it.each(GLYPHS)('%s draws a skeleton inside its own box', (key, glyph) => {
    const { calls, path } = recorder();
    glyph.build(path, glyph.w * HEIGHT, HEIGHT);

    expect(glyph.w).toBeGreaterThan(0);
    expect(glyph.w).toBeLessThan(1.4);
    expect(calls.filter((call) => call.op !== 'closePath').length).toBeGreaterThan(1);

    const width = glyph.w * HEIGHT;
    for (const call of calls) {
      if (call.op === 'closePath') continue;
      if (call.op === 'arc') {
        // Round bowls (5, Q) overshoot their advance width slightly, as bowls do in
        // type design; the generous 10 % cap still catches a runaway radius.
        expect(call.radius).toBeGreaterThan(0);
        expect(call.centre.y - call.radius).toBeGreaterThanOrEqual(-EPSILON);
        expect(call.centre.y + call.radius).toBeLessThanOrEqual(HEIGHT + EPSILON);
        expect(call.centre.x + call.radius).toBeLessThanOrEqual(width * 1.1);
        continue;
      }
      for (const point of call.points) {
        expect(point.x).toBeGreaterThanOrEqual(-EPSILON);
        expect(point.x).toBeLessThanOrEqual(width * (1 + OVERSHOOT) + EPSILON);
        expect(point.y).toBeGreaterThanOrEqual(-EPSILON);
        expect(point.y).toBeLessThanOrEqual(HEIGHT * (1 + OVERSHOOT) + EPSILON);
      }
    }
    expect(key.length).toBe(1);
  });

  it('scales with the cap height without drifting outside the box', () => {
    const glyph = DECO_ALPHABET.M;
    for (const height of [10, 40, 250]) {
      const { calls, path } = recorder();
      glyph.build(path, glyph.w * height, height);
      const ys = calls.flatMap((call) => (call.op === 'arc' ? [call.centre.y] : call.op === 'lineTo' || call.op === 'moveTo' ? call.points.map((p) => p.y) : []));
      expect(Math.max(...ys)).toBeLessThanOrEqual(height + EPSILON);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-EPSILON);
    }
  });

  it('draws only finite arcs with a positive radius', () => {
    for (const [, glyph] of GLYPHS) {
      const { calls, path } = recorder();
      glyph.build(path, glyph.w * HEIGHT, HEIGHT);
      for (const call of calls) {
        if (call.op !== 'arc') continue;
        expect(call.radius).toBeGreaterThan(0);
        expect(Number.isFinite(call.start)).toBe(true);
        expect(Number.isFinite(call.end)).toBe(true);
      }
    }
  });
});
