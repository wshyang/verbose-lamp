import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import { clampBorderStyle, clampFrameStyle } from './styleClamp';

describe('clampFrameStyle', () => {
  const base = {
    intricacy: 0.5,
    formula: {
      ...DEFAULT_FRAME_STYLE.formula,
      genome: { ...SIGNATURE_GENOME },
      layers: [{ source: 'fractal' as const, enabled: true, level: 2 }],
    },
  };

  it('leaves a legal style unchanged', () => {
    expect(clampFrameStyle(base)).toEqual(base);
  });

  it('bounds intricacy, level and layer level', () => {
    const wild = {
      intricacy: 4,
      formula: {
        ...base.formula,
        level: 9.6,
        layers: [{ source: 'fractal' as const, enabled: false, level: -3 }],
      },
    };
    const clamped = clampFrameStyle(wild);
    expect(clamped.intricacy).toBe(1);
    expect(clamped.formula.level).toBe(4);
    expect(clamped.formula.layers?.[0].level).toBe(1);
  });

  it('clamps a negative level to the first step and rounds fractional levels', () => {
    const clamped = clampFrameStyle({
      intricacy: -2,
      formula: { ...base.formula, level: 2.6 },
    });
    expect(clamped.intricacy).toBe(0);
    expect(clamped.formula.level).toBe(3);
  });

  it('turns missing layers into an empty list', () => {
    const clamped = clampFrameStyle({
      intricacy: 0.2,
      formula: { ...DEFAULT_FRAME_STYLE.formula, layers: undefined },
    });
    expect(clamped.formula.layers).toEqual([]);
  });

  it('sends the genome through the frame engine clamp', () => {
    const clamped = clampFrameStyle({
      ...base,
      formula: {
        ...base.formula,
        genome: { ...SIGNATURE_GENOME, fractalDepth: 99, zigguratSteps: -5 },
      },
    });
    expect(clamped.formula.genome.fractalDepth).toBeLessThan(99);
    expect(clamped.formula.genome.zigguratSteps).toBeGreaterThanOrEqual(1);
  });
});

describe('clampBorderStyle', () => {
  it('bounds the weight and clamps the genome', () => {
    const clamped = clampBorderStyle({
      weight: 3,
      genome: { ...SIGNATURE_GENOME, fractalDepth: 42 },
    });
    expect(clamped.weight).toBe(1);
    expect(clamped.genome.fractalDepth).toBeLessThan(42);
  });

  it('leaves the default style alone', () => {
    const style = { ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...SIGNATURE_GENOME } };
    expect(clampBorderStyle(style)).toEqual(style);
  });

  it('clamps a negative weight to zero', () => {
    expect(clampBorderStyle({ weight: -0.4, genome: { ...SIGNATURE_GENOME } }).weight).toBe(0);
  });
});
