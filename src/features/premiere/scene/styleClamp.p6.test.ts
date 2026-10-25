// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_STYLE, DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { LAST_FRAME_EPSILON, clampFormulaLevel, clampFrameStyle, clampIntricacy, clampScreenBorderStyle, clampSequenceTime } from './styleClamp';

/** Both renderers clamp through here, so these are the numbers they must agree on. */
describe('clampSequenceTime', () => {
  it('holds the film between its first frame and one millisecond short of its last', () => {
    expect(clampSequenceTime(-4)).toBe(0);
    expect(clampSequenceTime(0)).toBe(0);
    expect(clampSequenceTime(12.5)).toBe(12.5);
    expect(clampSequenceTime(TOTAL_SEQUENCE_DURATION)).toBeCloseTo(
      TOTAL_SEQUENCE_DURATION - LAST_FRAME_EPSILON,
      9
    );
    expect(clampSequenceTime(999)).toBeLessThan(TOTAL_SEQUENCE_DURATION);
  });
});
describe('clampIntricacy and clampFormulaLevel', () => {
  it('keeps intricacy in 0…1 and levels whole, 1…4', () => {
    expect(clampIntricacy(-1)).toBe(0);
    expect(clampIntricacy(0.42)).toBe(0.42);
    expect(clampIntricacy(9)).toBe(1);

    expect(clampFormulaLevel(0)).toBe(1);
    expect(clampFormulaLevel(2.49)).toBe(2);
    expect(clampFormulaLevel(2.6)).toBe(3);
    expect(clampFormulaLevel(7)).toBe(4);
  });
});
describe('clampFrameStyle', () => {
  it('leaves a legal style untouched', () => {
    expect(clampFrameStyle(DEFAULT_FRAME_STYLE)).toEqual(DEFAULT_FRAME_STYLE);
  });

  it('clamps intricacy, the level and the genome, and keeps the layer list', () => {
    const style = clampFrameStyle({
      intricacy: 4,
      formula: {
        source: 'fractal',
        level: 9,
        genome: { ...SIGNATURE_GENOME, fractalDepth: -5 },
        layers: [
          { source: 'fractal', enabled: true, level: 9 },
          { source: 'lattice', enabled: false, level: -2 },
        ],
      },
    });

    expect(style.intricacy).toBe(1);
    expect(style.formula.level).toBe(4);
    expect(style.formula.layers).toEqual([
      { source: 'fractal', enabled: true, level: 4 },
      { source: 'lattice', enabled: false, level: 1 },
    ]);
    expect(style.formula.genome.fractalDepth).toBeGreaterThanOrEqual(0);
  });

  it('gives a layered style with no layers an empty list rather than undefined', () => {
    const style = clampFrameStyle({
      intricacy: 0.5,
      formula: { source: 'authored', level: 2, genome: { ...SIGNATURE_GENOME } },
    });

    expect(style.formula.layers).toEqual([]);
  });
});
describe('clampScreenBorderStyle', () => {
  it('keeps a lattice pattern and its seed, which select the proscenium', () => {
    const style = clampScreenBorderStyle({
      ...DEFAULT_SCREEN_BORDER_STYLE,
      pattern: 'lattice',
      seed: 7,
    });

    expect(style.pattern).toBe('lattice');
    expect(style.seed).toBe(7);
  });
});
