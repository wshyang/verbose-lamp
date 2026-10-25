// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { clampFrameStyle } from './styleClamp';

describe('clampFrameStyle', () => {
  it('passes the default style through unchanged in value', () => {
    const clamped = clampFrameStyle(DEFAULT_FRAME_STYLE);
    expect(clamped.intricacy).toBe(DEFAULT_FRAME_STYLE.intricacy);
    expect(clamped.formula.source).toBe('authored');
    expect(clamped.formula.genome).toEqual(SIGNATURE_GENOME);
    expect(clamped.formula.layers).toHaveLength(4);
  });

  it('clamps intricacy, rounds and clamps levels, keeps the seed', () => {
    const clamped = clampFrameStyle({
      intricacy: 7,
      formula: {
        source: 'lattice', level: 9.6, seed: 4242,
        genome: { ...SIGNATURE_GENOME },
        layers: [{ source: 'fractal', enabled: true, level: 0.2 }],
      },
    });
    expect(clamped.intricacy).toBe(1);
    expect(clamped.formula.level).toBe(4);
    expect(clamped.formula.seed).toBe(4242);
    expect(clamped.formula.layers).toEqual([{ source: 'fractal', enabled: true, level: 1 }]);
  });

  it('defaults missing layers to an empty list and low intricacy to 0', () => {
    const clamped = clampFrameStyle({
      intricacy: -2,
      formula: { source: 'rosette', level: 2, genome: { ...SIGNATURE_GENOME } },
    });
    expect(clamped.intricacy).toBe(0);
    expect(clamped.formula.layers).toEqual([]);
    expect(clamped.formula.seed).toBeUndefined();
  });

  it('does not mutate the input style', () => {
    const style = {
      intricacy: 7,
      formula: {
        source: 'arcade' as const, level: 3,
        genome: { ...SIGNATURE_GENOME },
        layers: [{ source: 'rosette' as const, enabled: false, level: 2 }],
      },
    };
    const before = JSON.stringify(style);
    clampFrameStyle(style);
    expect(JSON.stringify(style)).toBe(before);
  });
});
