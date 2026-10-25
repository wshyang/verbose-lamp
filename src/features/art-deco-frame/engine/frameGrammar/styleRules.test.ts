import { describe, expect, it } from 'vitest';
import { clampGenome, SIGNATURE_GENOME } from './genome';
import {
  clampFormulaLevel,
  clampIntricacy,
  normalizeFrameStyle,
  normalizeScreenBorderStyle,
  resolveGenesisLevel,
} from './styleRules';
import {
  DEFAULT_FRAME_FORMULA,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  type FrameStyle,
  type ScreenBorderStyle,
} from './types';

const frameStyle = (overrides: Partial<FrameStyle['formula']> = {}, intricacy = 0.5): FrameStyle => ({
  intricacy,
  formula: { source: 'authored', level: 2, genome: { ...SIGNATURE_GENOME }, ...overrides },
});

const borderStyle = (overrides: Partial<ScreenBorderStyle> = {}): ScreenBorderStyle => ({
  weight: 0.5,
  genome: { ...SIGNATURE_GENOME },
  ...overrides,
});

describe('clampFormulaLevel', () => {
  it.each([
    [-3, 1],
    [0, 1],
    [1, 1],
    [2.4, 2],
    [2.5, 3],
    [2.6, 3],
    [4, 4],
    [9.6, 4],
  ])('holds %s to the whole level %s', (level, expected) => {
    expect(clampFormulaLevel(level)).toBe(expected);
  });

  it('pins an infinity to the nearest end, because it asks for as much or as little as possible', () => {
    expect(clampFormulaLevel(Number.POSITIVE_INFINITY)).toBe(4);
    expect(clampFormulaLevel(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it('gives NaN the minimum level, because nothing was asked for', () => {
    expect(clampFormulaLevel(Number.NaN)).toBe(1);
  });
});

describe('resolveGenesisLevel', () => {
  it('draws at the requested level, held to 1..4', () => {
    expect(resolveGenesisLevel(3)).toBe(3);
    expect(resolveGenesisLevel(2.6)).toBe(3);
    expect(resolveGenesisLevel(9)).toBe(4);
    expect(resolveGenesisLevel(0.2)).toBe(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'draws at the default level when the level is the unusable value %s',
    (level) => {
      expect(resolveGenesisLevel(level)).toBe(DEFAULT_FRAME_FORMULA.level);
    },
  );
});

describe('clampIntricacy', () => {
  it('holds 0 and 1 and passes the middle through', () => {
    expect(clampIntricacy(-3)).toBe(0);
    expect(clampIntricacy(0.42)).toBe(0.42);
    expect(clampIntricacy(4)).toBe(1);
  });

  it('falls back to the film baseline for NaN', () => {
    expect(clampIntricacy(Number.NaN)).toBe(DEFAULT_FRAME_STYLE.intricacy);
  });
});

describe('normalizeFrameStyle', () => {
  it('leaves a legal style equal in value but not the same object', () => {
    const normalized = normalizeFrameStyle(DEFAULT_FRAME_STYLE);

    expect(normalized).toEqual(DEFAULT_FRAME_STYLE);
    expect(normalized).not.toBe(DEFAULT_FRAME_STYLE);
    expect(normalized.formula).not.toBe(DEFAULT_FRAME_STYLE.formula);
  });

  it('pulls wild intricacy, level, genome and layer levels back into range', () => {
    const wild = { ...SIGNATURE_GENOME, cornerScale: 12, rayDensity: Number.NaN };
    const normalized = normalizeFrameStyle(
      frameStyle(
        {
          source: 'fractal',
          level: 9.6,
          genome: wild,
          layers: [
            { source: 'rosette', enabled: true, level: 0 },
            { source: 'arcade', enabled: false, level: 3.4 },
          ],
        },
        4,
      ),
    );

    expect(normalized.intricacy).toBe(1);
    expect(normalized.formula.level).toBe(4);
    expect(normalized.formula.genome).toEqual(clampGenome(wild));
    expect(Number.isFinite(normalized.formula.genome.rayDensity)).toBe(true);
    expect(normalized.formula.layers).toEqual([
      { source: 'rosette', enabled: true, level: 1 },
      { source: 'arcade', enabled: false, level: 3 },
    ]);
  });

  it('floors a negative intricacy at 0 and a negative level at 1', () => {
    const normalized = normalizeFrameStyle(frameStyle({ source: 'fractal', level: -3 }, -2));

    expect(normalized.intricacy).toBe(0);
    expect(normalized.formula.level).toBe(1);
  });

  it('gives a style with no layers an empty list rather than undefined', () => {
    expect(normalizeFrameStyle(frameStyle()).formula.layers).toEqual([]);
    expect(normalizeFrameStyle(frameStyle({ layers: [] })).formula.layers).toEqual([]);
  });

  it('keeps the lattice seed', () => {
    const normalized = normalizeFrameStyle(frameStyle({ source: 'lattice', seed: 4242 }));

    expect(normalized.formula.seed).toBe(4242);
  });

  it('leaves the seed absent when none was given', () => {
    expect(normalizeFrameStyle(DEFAULT_FRAME_STYLE).formula.seed).toBeUndefined();
  });

  it('keeps a formula field it has never heard of, so a new field cannot be silently dropped', () => {
    const future = { ...frameStyle().formula, tilt: 0.3 };
    const normalized = normalizeFrameStyle({ intricacy: 0.5, formula: future });

    expect((normalized.formula as typeof future).tilt).toBe(0.3);
  });

  it('copies the layers rather than aliasing them', () => {
    const layers = [{ source: 'fractal' as const, enabled: true, level: 2 }];
    const normalized = normalizeFrameStyle(frameStyle({ layers }));

    expect(normalized.formula.layers).not.toBe(layers);
    expect(normalized.formula.layers?.[0]).not.toBe(layers[0]);
  });

  it('never mutates its input', () => {
    const input = frameStyle({ level: 9, layers: [{ source: 'lattice', enabled: true, level: 9 }] }, 5);
    const before = JSON.stringify(input);

    normalizeFrameStyle(input);

    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('normalizeScreenBorderStyle', () => {
  it('clamps weight and routes the genome through clampGenome', () => {
    const wild = { ...SIGNATURE_GENOME, wingSweep: 9 };

    expect(normalizeScreenBorderStyle(borderStyle({ weight: -2, genome: wild })).weight).toBe(0);
    expect(normalizeScreenBorderStyle(borderStyle({ weight: 7 })).weight).toBe(1);
    expect(normalizeScreenBorderStyle(borderStyle({ genome: wild })).genome).toEqual(clampGenome(wild));
  });

  it('falls back to the default weight for NaN', () => {
    expect(normalizeScreenBorderStyle(borderStyle({ weight: Number.NaN })).weight).toBe(
      DEFAULT_SCREEN_BORDER_STYLE.weight,
    );
  });

  it('passes the default border through by value', () => {
    expect(normalizeScreenBorderStyle(DEFAULT_SCREEN_BORDER_STYLE)).toEqual(DEFAULT_SCREEN_BORDER_STYLE);
  });

  it('passes through any other field it does not own', () => {
    const input = { ...borderStyle(), extra: 'kept' };

    expect((normalizeScreenBorderStyle(input) as typeof input).extra).toBe('kept');
  });

  it('never mutates its input', () => {
    const input = borderStyle({ weight: 5 });

    normalizeScreenBorderStyle(input);

    expect(input.weight).toBe(5);
  });

  it('keeps a lattice pattern and its seed, which select the proscenium', () => {
    const normalized = normalizeScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, pattern: 'lattice', seed: 7 });

    expect(normalized.pattern).toBe('lattice');
    expect(normalized.seed).toBe(7);
  });
});
