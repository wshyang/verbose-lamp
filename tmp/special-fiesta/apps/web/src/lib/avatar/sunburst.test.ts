import { describe, expect, it } from 'vitest';
import {
  SUNBURST_BANDS_MAX,
  SUNBURST_RAYS_MAX,
  SUNBURST_RAYS_MIN,
  type AvatarSunburst,
} from '@psd/contracts';
import { bandOfCell, splitBackdropCells } from './sunburst.js';

const RAY = ['B', 'R'];
/** ADR-206 — two bands is the old ray/gap split, so `band 0` is exactly "is a ray". */
const isRay = (cell: { x: number; y: number }, size: number, sunburst: AvatarSunburst) =>
  bandOfCell(cell, size, sunburst) === 0;

/**
 * Walks a circle of the given radius and counts how many times the pattern changes between ray
 * and gap. A sunburst of N rays crosses 2N boundaries on any circle around its centre, at every
 * radius and every twist — that is what "N rays" means, and it is the one property a participant
 * moving the slider is actually buying.
 */
function wedgesAround(radius: number, size: number, sunburst: AvatarSunburst): number {
  const centre = size / 2;
  const samples = 3600;
  const seen: boolean[] = [];
  for (let i = 0; i < samples; i += 1) {
    const theta = (i / samples) * Math.PI * 2;
    seen.push(
      isRay(
        { x: centre + Math.cos(theta) * radius - 0.5, y: centre + Math.sin(theta) * radius - 0.5 },
        size,
        sunburst,
      ),
    );
  }
  let flips = 0;
  for (let i = 0; i < samples; i += 1) {
    // The wrap is counted once, so the walk closes on itself and no boundary is double-counted.
    if (seen[i] !== seen[(i + 1) % samples]) flips += 1;
  }
  return flips / 2;
}

describe('sunburst geometry', () => {
  it('draws exactly as many rays as asked, at every radius and twist', () => {
    for (const rays of [SUNBURST_RAYS_MIN, 5, 8, 12, SUNBURST_RAYS_MAX]) {
      for (const twist of [0, 4, 10]) {
        for (const radius of [6, 18, 30]) {
          expect(wedgesAround(radius, 64, { kind: 'spiral' as const, colourTwo: '#ffffff', rays, twist, bands: 2 })).toBe(rays);
        }
      }
    }
  });

  it('gives rays and gaps the same width, so the pattern reads as a sunburst', () => {
    const sunburst = { kind: 'spiral' as const, colourTwo: '#ffffff', rays: 8, twist: 0, bands: 2 };
    let ray = 0;
    const samples = 3600;
    for (let i = 0; i < samples; i += 1) {
      const theta = (i / samples) * Math.PI * 2;
      if (isRay({ x: 32 + Math.cos(theta) * 20, y: 32 + Math.sin(theta) * 20 }, 64, sunburst)) {
        ray += 1;
      }
    }
    expect(ray / samples).toBeCloseTo(0.5, 2);
  });

  it('is straight at twist 0 and bent once twisted', () => {
    const at = (twist: number, radius: number) =>
      isRay({ x: 32, y: 32 + radius }, 64, { kind: 'spiral' as const, colourTwo: '#fff', rays: 6, twist, bands: 2 });

    // Straight: a line out from the centre never leaves the ray it started in.
    const straight = [4, 10, 16, 22, 28].map((radius) => at(0, radius));
    expect(new Set(straight).size).toBe(1);

    // Twisted: that same line crosses into another ray before it reaches the edge.
    const bent = [4, 10, 16, 22, 28].map((radius) => at(10, radius));
    expect(new Set(bent).size).toBe(2);
  });

  it('is centred on the middle of the grid, not half a cell off it', () => {
    /*
     * The half-cell offset is what puts the origin on the grid's true centre. Cells 20,32 and
     * 43,31 sample points exactly opposite one another through that centre, so with an ODD ray
     * count — where half a turn is half a sector out of step — they must disagree. An even count
     * would pass this whether the offset were there or not, which is why 3 is used and not 4.
     */
    const sunburst = { kind: 'spiral' as const, colourTwo: '#fff', rays: 3, twist: 0, bands: 2 };
    expect(isRay({ x: 20, y: 32 }, 64, sunburst)).not.toBe(
      isRay({ x: 43, y: 31 }, 64, sunburst),
    );
  });
});

describe('splitBackdropCells', () => {
  const sunburst = { kind: 'spiral' as const, colourTwo: '#ffffff', rays: 4, twist: 0, bands: 2 };

  it('recolours only the keys it was given', () => {
    const rows = ['BBKK', 'BBKK', 'KKBB', 'KKBB'];
    const out = splitBackdropCells(rows, new Map([['B', RAY]]), sunburst);
    const joined = out.join('');
    expect(joined.match(/K/gu)).toHaveLength(8);
    expect(joined).toMatch(/R/u);
  });

  it('leaves a grid with no backdrop in it completely alone', () => {
    const rows = ['KKKK', 'KKKK', 'KKKK', 'KKKK'];
    expect(splitBackdropCells(rows, new Map([['B', RAY]]), sunburst)).toEqual(rows);
  });

  it('does not mutate the rows it was handed', () => {
    const rows = ['BBBB', 'BBBB', 'BBBB', 'BBBB'];
    const before = [...rows];
    splitBackdropCells(rows, new Map([['B', RAY]]), sunburst);
    expect(rows).toEqual(before);
  });

  it('keeps the vignette by splitting shade and base separately', () => {
    const rows = ['bBBb', 'BBBB', 'BBBB', 'bBBb'];
    const out = splitBackdropCells(
      rows,
      new Map([
        ['B', ['B', 'R']],
        ['b', ['b', 'r']],
      ]),
      sunburst,
    ).join('');
    // Every corner was shade, and every corner is still one of the two shades.
    for (const corner of [out.charAt(0), out.charAt(3), out.charAt(12), out.charAt(15)]) {
      expect(['b', 'r']).toContain(corner);
    }
  });
});

/**
 * ADR-206 — bands, and the two properties that have to hold whatever the count is.
 */
describe('bands (ADR-206)', () => {
  const spiral = (bands: number) => ({ kind: 'spiral' as const, colourTwo: '#ffffff', rays: 4, twist: 0, bands });

  it('cuts each sector into exactly as many bands as asked, in order', () => {
    for (let bands = 2; bands <= SUNBURST_BANDS_MAX; bands += 1) {
      const seen = new Set<number>();
      const samples = 3600;
      for (let i = 0; i < samples; i += 1) {
        const theta = (i / samples) * Math.PI * 2;
        seen.add(bandOfCell({ x: 32 + Math.cos(theta) * 20, y: 32 + Math.sin(theta) * 20 }, 64,
          spiral(bands)));
      }
      // Every band appears, and nothing outside the range ever does.
      expect([...seen].sort((a, b) => a - b)).toEqual(
        Array.from({ length: bands }, (_unused, index) => index),
      );
    }
  });

  it('gives every band the same share of the circle', () => {
    const counts = new Map<number, number>();
    const samples = 3600;
    for (let i = 0; i < samples; i += 1) {
      const theta = (i / samples) * Math.PI * 2;
      const band = bandOfCell({ x: 32 + Math.cos(theta) * 20, y: 32 + Math.sin(theta) * 20 }, 64,
        spiral(4));
      counts.set(band, (counts.get(band) ?? 0) + 1);
    }
    for (const band of [0, 1, 2, 3]) {
      expect((counts.get(band) ?? 0) / samples).toBeCloseTo(0.25, 2);
    }
  });

  it('falls back to the last colour it was given rather than leaving a hole', () => {
    // A caller asking for four bands but offering two keys is asking for a pattern it cannot
    // paint. The honest answer is the last colour supplied, never an unpainted cell.
    const rows = ['BBBB', 'BBBB', 'BBBB', 'BBBB'];
    const out = splitBackdropCells(rows, new Map([['B', ['B', 'R']]]), spiral(4)).join('');
    expect(out).toMatch(/^[BR]+$/u);
    expect(out).toHaveLength(16);
  });
});
