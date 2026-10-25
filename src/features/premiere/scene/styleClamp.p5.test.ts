// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { clampGenome, DEFAULT_FRAME_STYLE, DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME, type FrameStyle, type ScreenBorderStyle } from '@/features/art-deco-frame';
import { clampFrameStyle, clampScreenBorderStyle, clampSequenceTime } from './styleClamp';

const frameStyle_p5 = (overrides: Partial<FrameStyle['formula']> = {}, intricacy = 0.5): FrameStyle => ({
  intricacy,
  formula: {
    source: 'authored',
    level: 2,
    genome: { ...SIGNATURE_GENOME },
    ...overrides,
  },
});
describe('clampFrameStyle', () => {
  it('passes the signature style through by value', () => {
    const clamped = clampFrameStyle(DEFAULT_FRAME_STYLE);
    expect(clamped.intricacy).toBe(DEFAULT_FRAME_STYLE.intricacy);
    expect(clamped.formula.source).toBe(DEFAULT_FRAME_STYLE.formula.source);
    expect(clamped.formula.level).toBe(DEFAULT_FRAME_STYLE.formula.level);
    expect(clamped.formula.genome).toEqual({ ...SIGNATURE_GENOME });
    expect(clamped.formula.layers).toEqual(DEFAULT_FRAME_STYLE.formula.layers);
    expect(clamped).not.toBe(DEFAULT_FRAME_STYLE);
    expect(clamped.formula).not.toBe(DEFAULT_FRAME_STYLE.formula);
  });

  it('clamps intricacy to [0, 1]', () => {
    expect(clampFrameStyle(frameStyle_p5({}, -0.5)).intricacy).toBe(0);
    expect(clampFrameStyle(frameStyle_p5({}, 1.7)).intricacy).toBe(1);
    expect(clampFrameStyle(frameStyle_p5({}, 0.75)).intricacy).toBe(0.75);
  });

  it('rounds and clamps the formula level to 1..4', () => {
    expect(clampFrameStyle(frameStyle_p5({ level: 0 })).formula.level).toBe(1);
    expect(clampFrameStyle(frameStyle_p5({ level: 9 })).formula.level).toBe(4);
    expect(clampFrameStyle(frameStyle_p5({ level: 2.6 })).formula.level).toBe(3);
  });

  it('routes the genome through clampGenome', () => {
    const wild = { ...SIGNATURE_GENOME, cornerScale: 99 };
    const clamped = clampFrameStyle(frameStyle_p5({ genome: wild }));
    expect(clamped.formula.genome).toEqual(clampGenome(wild));
    expect(clamped.formula.genome.cornerScale).toBeLessThan(99);
  });

  it('normalises layers, defaulting to none', () => {
    expect(clampFrameStyle(frameStyle_p5()).formula.layers).toEqual([]);
    expect(clampFrameStyle(frameStyle_p5({ layers: [] })).formula.layers).toEqual([]);
    const clamped = clampFrameStyle(
      frameStyle_p5({ layers: [{ source: 'lattice', enabled: true, level: 9 }] }),
    );
    expect(clamped.formula.layers).toEqual([{ source: 'lattice', enabled: true, level: 4 }]);
  });
});
describe('clampScreenBorderStyle', () => {
  const borderStyle = (overrides: Partial<ScreenBorderStyle> = {}): ScreenBorderStyle => ({
    weight: 0.5,
    genome: { ...SIGNATURE_GENOME },
    ...overrides,
  });

  it('passes the default border through by value', () => {
    const clamped = clampScreenBorderStyle(DEFAULT_SCREEN_BORDER_STYLE);
    expect(clamped.weight).toBe(0.5);
    expect(clamped.pattern).toBe('poster');
    expect(clamped.genome).toEqual({ ...SIGNATURE_GENOME });
  });

  it('routes the genome through clampGenome', () => {
    const wild = { ...SIGNATURE_GENOME, rayDensity: 42 };
    expect(clampScreenBorderStyle(borderStyle({ genome: wild })).genome).toEqual(clampGenome(wild));
  });
});
describe('clampSequenceTime', () => {
  it('keeps time inside the 38 s sequence', () => {
    expect(clampSequenceTime(-5)).toBe(0);
    expect(clampSequenceTime(38)).toBe(37.999);
    expect(clampSequenceTime(12.5)).toBe(12.5);
  });
});
