import { describe, expect, it } from 'vitest';
import { REFERENCE_GRID, bandOf, edgeDistance, fieldAt } from './patterns';
import { fleckAt, leafAt } from './goldLeaf';
import { DEFAULT_PATTERNS, ENAMEL_PALETTES } from './palettes';
import { withPatternKind, withPatternKnob, withSpecKnob, withColours } from './spec';
import type { BackdropPattern } from './types';
import { DEFAULT_BACKDROPS } from './palettes';

type Cell = { x: number; y: number };

// ── Reference oracles, copied verbatim (modulo types) from the reference studio's
//    sunburst.ts, concentric.ts, waves.ts and psychedelic.ts. ──────────────────────
function refSunburst(cell: Cell, size: number, p: { rays: number; twist: number; bands: number }): number {
  const centre = size / 2;
  const dx = cell.x + 0.5 - centre;
  const dy = cell.y + 0.5 - centre;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) + radius * p.twist * 0.006;
  const sector = (angle / (Math.PI * 2)) * p.rays;
  const phase = ((sector % 1) + 1) % 1;
  return Math.min(p.bands - 1, Math.floor(phase * p.bands));
}

function refConcentric(cell: Cell, size: number, p: { shape: number; ringWidth: number; lobes: number; lobeDepth: number; bands: number }): number {
  const exponents = [1, 2, 4, Infinity];
  const centre = size / 2;
  const dx = cell.x + 0.5 - centre;
  const dy = cell.y + 0.5 - centre;
  const e = exponents[p.shape - 1];
  const base = e === Infinity ? Math.max(Math.abs(dx), Math.abs(dy)) : e === 2 ? Math.sqrt(dx * dx + dy * dy) : (Math.abs(dx) ** e + Math.abs(dy) ** e) ** (1 / e);
  const petals = 1 + (p.lobeDepth / 10) * Math.cos(p.lobes * Math.atan2(dy, dx));
  return Math.floor(Math.max(0, base * petals) / p.ringWidth) % p.bands;
}

function refWaves(cell: Cell, size: number, p: { wave: number; period: number; amplitude: number; bandHeight: number; bands: number }): number {
  const centre = size / 2;
  const u = cell.x + 0.5 - centre;
  const v = cell.y + 0.5 - centre;
  const t = u / p.period;
  const form = p.wave === 2 ? Math.sin(t * Math.PI * 2) : 4 * Math.abs(t - Math.floor(t + 0.75) + 0.25) - 1;
  const index = Math.floor((v - ((p.period * p.amplitude) / 10) * form) / p.bandHeight);
  return ((index % p.bands) + p.bands) % p.bands;
}

function refPsychedelic(cell: Cell, size: number, p: { swirl: number; frequency: number; ripple: number; scale: number; bands: number }): number {
  const u = (cell.x + 0.5) / size - 0.5;
  const v = (cell.y + 0.5) / size - 0.5;
  const strength = (p.ripple / 10) * (0.8 / (p.frequency * p.frequency));
  const sweep = Math.PI * 2 * p.frequency;
  const wu = u + strength * Math.sin(sweep * v);
  const wv = v + strength * Math.sin(sweep * u);
  const distance = (Math.hypot(wu, wv) * size) / p.scale + (p.swirl * p.bands * Math.atan2(wv, wu)) / (Math.PI * 2);
  const index = Math.floor(distance);
  return ((index % p.bands) + p.bands) % p.bands;
}

function oracleFor(pattern: BackdropPattern, bands: number): (cell: Cell) => number {
  switch (pattern.kind) {
    case 'sunburst': return (cell) => refSunburst(cell, REFERENCE_GRID, { ...pattern, bands });
    case 'radiance': return (cell) => refConcentric(cell, REFERENCE_GRID, { ...pattern, bands });
    case 'chevron': return (cell) => refWaves(cell, REFERENCE_GRID, { ...pattern, bands });
    case 'swirl': return (cell) => refPsychedelic(cell, REFERENCE_GRID, { ...pattern, bands });
    default: throw new Error(`No reference oracle for ${pattern.kind}`);
  }
}

const VARIANTS: readonly { pattern: BackdropPattern; bands: number }[] = [
  { pattern: DEFAULT_PATTERNS.sunburst, bands: 2 },
  { pattern: { kind: 'sunburst', rays: 7, twist: 9 }, bands: 3 },
  { pattern: DEFAULT_PATTERNS.radiance, bands: 3 },
  { pattern: { kind: 'radiance', shape: 4, ringWidth: 5, lobes: 0, lobeDepth: 0 }, bands: 4 },
  { pattern: { kind: 'radiance', shape: 1, ringWidth: 11, lobes: 9, lobeDepth: 5 }, bands: 2 },
  { pattern: DEFAULT_PATTERNS.chevron, bands: 3 },
  { pattern: { kind: 'chevron', wave: 2, period: 40, amplitude: 7, bandHeight: 12 }, bands: 4 },
  { pattern: DEFAULT_PATTERNS.swirl, bands: 3 },
  { pattern: { kind: 'swirl', swirl: 4, frequency: 5, ripple: 10, scale: 5 }, bands: 2 },
];

describe('pattern fields', () => {
  it('reproduce the reference band functions on the 128 grid', () => {
    for (const { pattern, bands } of VARIANTS) {
      const oracle = oracleFor(pattern, bands);
      const mismatches: string[] = [];
      for (let y = 0; y < REFERENCE_GRID; y += 3) {
        for (let x = 0; x < REFERENCE_GRID; x += 3) {
          const ours = bandOf(fieldAt({ x, y }, { size: REFERENCE_GRID, bands }, pattern), bands);
          if (ours !== oracle({ x, y })) mismatches.push(`${pattern.kind}@${x},${y}`);
        }
      }
      expect(mismatches).toEqual([]);
    }
  });

  it('keeps every band index inside [0, bands)', () => {
    for (const { pattern, bands } of VARIANTS) {
      for (let at = 0; at < 64 * 64; at += 7) {
        const band = bandOf(fieldAt({ x: at % 64, y: Math.floor(at / 64) }, { size: 64, bands }, pattern), bands);
        expect(band).toBeGreaterThanOrEqual(0);
        expect(band).toBeLessThan(bands);
      }
    }
  });

  it('warps the swirl symmetrically about y = x', () => {
    const pattern: BackdropPattern = { kind: 'swirl', swirl: 0, frequency: 3, ripple: 8, scale: 6 };
    for (let at = 0; at < 40 * 40; at += 11) {
      const x = at % 40;
      const y = Math.floor(at / 40);
      expect(fieldAt({ x, y }, { size: 40, bands: 3 }, pattern)).toBeCloseTo(fieldAt({ x: y, y: x }, { size: 40, bands: 3 }, pattern), 9);
    }
  });

  it('gives horizontal stripes when the chevron has no swing', () => {
    const flat: BackdropPattern = { kind: 'chevron', wave: 1, period: 24, amplitude: 0, bandHeight: 8 };
    for (let y = 0; y < 32; y += 1) {
      const row = new Set(Array.from({ length: 32 }, (_, x) => bandOf(fieldAt({ x, y }, { size: 32, bands: 3 }, flat), 3)));
      expect(row.size).toBe(1);
    }
  });

  it('fans the Deco rays symmetrically about the vertical centre line', () => {
    const fan: BackdropPattern = { kind: 'fan', rays: 12, lift: 2 };
    for (let y = 0; y < 48; y += 5) {
      for (let x = 0; x < 48; x += 3) {
        const left = edgeDistance(fieldAt({ x, y }, { size: 48, bands: 3 }, fan));
        const right = edgeDistance(fieldAt({ x: 47 - x, y }, { size: 48, bands: 3 }, fan));
        expect(left).toBeCloseTo(right, 6);
      }
    }
  });

  it('measures edge distance as 0 on a boundary and 0.5 mid-band', () => {
    expect(edgeDistance(3)).toBe(0);
    expect(edgeDistance(-2.5)).toBe(0.5);
    expect(edgeDistance(7.9)).toBeCloseTo(0.1, 9);
  });
});

describe('gold leaf', () => {
  it('is deterministic, bounded, and seeded', () => {
    expect(leafAt(12.3, 4.56, 1925)).toBe(leafAt(12.3, 4.56, 1925));
    expect(leafAt(12.3, 4.56, 1925)).not.toBe(leafAt(12.3, 4.56, 7));
    for (let at = 0; at < 200; at += 1) {
      const value = leafAt(at * 0.37, at * 0.91, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('adds no leaf at density 0 and more leaf as density rises', () => {
    const sweep = (density: number) => Array.from({ length: 400 }, (_, at) => fleckAt({ u: (at % 20) / 20, v: Math.floor(at / 20) / 20 }, density)).reduce((a, b) => a + b, 0);
    expect(sweep(0)).toBe(0);
    expect(sweep(0.8)).toBeGreaterThan(sweep(0.3));
  });
});

describe('spec edits', () => {
  const base = DEFAULT_BACKDROPS[0].spec;

  it('switch pattern kind to that kind’s reference defaults', () => {
    expect(withPatternKind(base, 'swirl').pattern).toEqual(DEFAULT_PATTERNS.swirl);
    expect(withPatternKind(base, 'sunburst')).toBe(base);
  });

  it('clamp knobs to the reference ranges without mutating', () => {
    const edited = withPatternKnob(base, { key: 'rays', value: 99 });
    expect(edited.pattern).toEqual({ kind: 'sunburst', rays: 24, twist: 4 });
    expect(base.pattern).toEqual(DEFAULT_PATTERNS.sunburst);
    expect(withPatternKnob(base, { key: 'scale', value: 5 })).toBe(base);
    expect(withSpecKnob(base, { knob: 'bands', value: 9 }).bands).toBe(4);
    expect(withSpecKnob(base, { knob: 'gilt', value: 0.333 }).gilt).toBe(0.35);
  });

  it('accept only valid hex colours', () => {
    expect(withColours(base, { colourOne: '#ABCDEF' }).colourOne).toBe('#ABCDEF');
    expect(withColours(base, { colourTwo: 'red' }).colourTwo).toBe(base.colourTwo);
    expect(ENAMEL_PALETTES).toHaveLength(10);
  });
});

describe('fieldAt exhaustiveness', () => {
  it('throws on a pattern kind that was never wired in', () => {
    const bogus = { kind: 'plaid' } as unknown as BackdropPattern;
    expect(() => fieldAt({ x: 0, y: 0 }, { size: 4, bands: 2 }, bogus)).toThrow('Unhandled backdrop pattern');
  });
});
