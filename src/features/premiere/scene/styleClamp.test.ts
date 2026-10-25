import { describe, expect, it } from 'vitest';
import {
  clampGenome,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import {
  chapterJumpTarget,
  clampFrameStyle,
  clampScreenBorderStyle,
  clampSequenceTime,
} from './styleClamp';

const frameStyle = (overrides: Partial<FrameStyle['formula']> = {}, intricacy = 0.5): FrameStyle => ({
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
    expect(clampFrameStyle(frameStyle({}, -0.5)).intricacy).toBe(0);
    expect(clampFrameStyle(frameStyle({}, 1.7)).intricacy).toBe(1);
    expect(clampFrameStyle(frameStyle({}, 0.75)).intricacy).toBe(0.75);
  });

  it('rounds and clamps the formula level to 1..4', () => {
    expect(clampFrameStyle(frameStyle({ level: 0 })).formula.level).toBe(1);
    expect(clampFrameStyle(frameStyle({ level: 9 })).formula.level).toBe(4);
    expect(clampFrameStyle(frameStyle({ level: 2.6 })).formula.level).toBe(3);
  });

  it('keeps an absent seed absent and sanitises a present one', () => {
    expect(clampFrameStyle(frameStyle()).formula.seed).toBeUndefined();
    expect(clampFrameStyle(frameStyle({ seed: -4 })).formula.seed).toBe(0);
    expect(clampFrameStyle(frameStyle({ seed: 12.8 })).formula.seed).toBe(13);
  });

  it('routes the genome through clampGenome', () => {
    const wild = { ...SIGNATURE_GENOME, cornerScale: 99 };
    const clamped = clampFrameStyle(frameStyle({ genome: wild }));
    expect(clamped.formula.genome).toEqual(clampGenome(wild));
    expect(clamped.formula.genome.cornerScale).toBeLessThan(99);
  });

  it('normalises layers, defaulting to none', () => {
    expect(clampFrameStyle(frameStyle()).formula.layers).toEqual([]);
    expect(clampFrameStyle(frameStyle({ layers: [] })).formula.layers).toEqual([]);
    const clamped = clampFrameStyle(
      frameStyle({ layers: [{ source: 'lattice', enabled: true, level: 9 }] }),
    );
    expect(clamped.formula.layers).toEqual([{ source: 'lattice', enabled: true, level: 4 }]);
  });

  it('never mutates its input', () => {
    const input = frameStyle({ level: 9 }, 5);
    clampFrameStyle(input);
    expect(input.intricacy).toBe(5);
    expect(input.formula.level).toBe(9);
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

  it('clamps weight, defaults the pattern and sanitises the seed', () => {
    expect(clampScreenBorderStyle(borderStyle({ weight: -1 })).weight).toBe(0);
    expect(clampScreenBorderStyle(borderStyle({ weight: 2 })).weight).toBe(1);
    expect(clampScreenBorderStyle(borderStyle()).pattern).toBe('poster');
    expect(clampScreenBorderStyle(borderStyle({ pattern: 'lattice' })).pattern).toBe('lattice');
    expect(clampScreenBorderStyle(borderStyle()).seed).toBeUndefined();
    expect(clampScreenBorderStyle(borderStyle({ seed: -2.4 })).seed).toBe(0);
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

describe('chapterJumpTarget', () => {
  it('lands 0.15 s into the clamped chapter', () => {
    expect(chapterJumpTarget(2, SEQUENCE_CHAPTERS)).toEqual({ index: 2, time: 14.15 });
    expect(chapterJumpTarget(-2, SEQUENCE_CHAPTERS)).toEqual({ index: 0, time: 0.15 });
    expect(chapterJumpTarget(99, SEQUENCE_CHAPTERS)).toEqual({ index: 4, time: 27.65 });
  });
});
