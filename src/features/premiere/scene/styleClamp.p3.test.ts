// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { clampGenome, DEFAULT_FRAME_STYLE, DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { clampFrameStyle, clampScreenBorderStyle } from './styleClamp';

describe('clampFrameStyle', () => {
  it('keeps a sane style untouched', () => {
    const style = clampFrameStyle(DEFAULT_FRAME_STYLE);
    expect(style.intricacy).toBe(DEFAULT_FRAME_STYLE.intricacy);
    expect(style.formula.level).toBe(2);
    expect(style.formula.genome).toEqual(DEFAULT_FRAME_STYLE.formula.genome);
  });

  it('pulls wild values back into range', () => {
    const style = clampFrameStyle({
      intricacy: 4,
      formula: {
        source: 'fractal',
        level: 9.6,
        genome: { ...SIGNATURE_GENOME, cornerScale: 12, rayDensity: Number.NaN },
        layers: [
          { source: 'rosette', enabled: true, level: 0 },
          { source: 'arcade', enabled: false, level: 3.4 },
        ],
      },
    });

    expect(style.intricacy).toBe(1);
    expect(style.formula.level).toBe(4);
    expect(style.formula.genome).toEqual(
      clampGenome({ ...SIGNATURE_GENOME, cornerScale: 12, rayDensity: Number.NaN }),
    );
    expect(Number.isFinite(style.formula.genome.rayDensity)).toBe(true);
    expect(style.formula.layers).toEqual([
      { source: 'rosette', enabled: true, level: 1 },
      { source: 'arcade', enabled: false, level: 3 },
    ]);
  });

  it('drops a missing layer list instead of crashing the rig', () => {
    const style = clampFrameStyle({
      intricacy: 0,
      formula: { source: 'fractal', level: -3, genome: { ...SIGNATURE_GENOME } },
    });
    expect(style.intricacy).toBe(0);
    expect(style.formula.level).toBe(1);
    expect(style.formula.layers).toEqual([]);
  });

  it('copies the layers rather than aliasing them', () => {
    const layers = [{ source: 'fractal' as const, enabled: true, level: 2 }];
    const style = clampFrameStyle({
      intricacy: 0.5,
      formula: { source: 'fractal', level: 2, genome: { ...SIGNATURE_GENOME }, layers },
    });
    expect(style.formula.layers).not.toBe(layers);
    expect(style.formula.layers?.[0]).not.toBe(layers[0]);
  });
});
describe('clampScreenBorderStyle', () => {
  it('clamps weight and genome', () => {
    const style = clampScreenBorderStyle({
      weight: -2,
      genome: { ...DEFAULT_SCREEN_BORDER_STYLE.genome, wingSweep: 9 },
    });
    expect(style.weight).toBe(0);
    expect(style.genome).toEqual(
      clampGenome({ ...DEFAULT_SCREEN_BORDER_STYLE.genome, wingSweep: 9 }),
    );
  });
});
