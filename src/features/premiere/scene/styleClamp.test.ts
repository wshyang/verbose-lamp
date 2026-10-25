import { describe, expect, it } from 'vitest';
import {
  clampGenome,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
  type FrameStyle,
} from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  CHAPTER_JUMP_OFFSET,
  LAST_FRAME_EPSILON,
  chapterJumpTarget,
  clampChapterIndex,
  clampFormulaLevel,
  clampFrameStyle,
  clampIntricacy,
  clampScreenBorderStyle,
  clampSequenceTime,
} from './styleClamp';

const frameStyle = (overrides: Partial<FrameStyle['formula']> = {}, intricacy = 0.5): FrameStyle => ({
  intricacy,
  formula: { source: 'authored', level: 2, genome: { ...SIGNATURE_GENOME }, ...overrides },
});

describe('clampSequenceTime', () => {
  it('keeps the playhead inside the 38 s sequence, one frame short of the end', () => {
    expect(clampSequenceTime(-5)).toBe(0);
    expect(clampSequenceTime(0)).toBe(0);
    expect(clampSequenceTime(11.28)).toBe(11.28);
    expect(clampSequenceTime(TOTAL_SEQUENCE_DURATION)).toBeCloseTo(TOTAL_SEQUENCE_DURATION - LAST_FRAME_EPSILON, 12);
    expect(clampSequenceTime(99)).toBeCloseTo(37.999, 12);
    expect(LAST_FRAME_EPSILON).toBe(0.001);
  });

  // The shipped clamp let NaN through, and activeChapterIndex then read it as the finale,
  // so a NaN seek silently teleported to the last act. A bad time becomes the start instead.
  it('turns NaN into the start instead of teleporting to the finale', () => {
    expect(clampSequenceTime(Number.NaN)).toBe(0);
  });

  it('pins infinities to the ends', () => {
    expect(clampSequenceTime(Number.POSITIVE_INFINITY)).toBeCloseTo(37.999, 12);
    expect(clampSequenceTime(Number.NEGATIVE_INFINITY)).toBe(0);
  });
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

describe('clampFormulaLevel', () => {
  it('rounds to a whole number between 1 and 4', () => {
    expect(clampFormulaLevel(0)).toBe(1);
    expect(clampFormulaLevel(-3)).toBe(1);
    expect(clampFormulaLevel(2.4)).toBe(2);
    expect(clampFormulaLevel(2.5)).toBe(3);
    expect(clampFormulaLevel(9.6)).toBe(4);
  });

  it('falls back to level 1 for NaN', () => {
    expect(clampFormulaLevel(Number.NaN)).toBe(1);
  });
});

describe('clampChapterIndex', () => {
  it('keeps the index on a real chapter', () => {
    expect(clampChapterIndex(-2)).toBe(0);
    expect(clampChapterIndex(2)).toBe(2);
    expect(clampChapterIndex(99)).toBe(SEQUENCE_CHAPTERS.length - 1);
  });

  it('rounds a fractional index', () => {
    expect(clampChapterIndex(1.4)).toBe(1);
    expect(clampChapterIndex(1.6)).toBe(2);
  });

  // The shipped clamp returned NaN, and `SEQUENCE_CHAPTERS[NaN].startTime` then threw.
  it('falls back to the first chapter for NaN instead of an undefined chapter', () => {
    expect(clampChapterIndex(Number.NaN)).toBe(0);
  });
});

describe('chapterJumpTarget', () => {
  it('lands 0.15 s into the clamped chapter', () => {
    expect(chapterJumpTarget(2, SEQUENCE_CHAPTERS)).toEqual({ index: 2, time: 14.15 });
    expect(chapterJumpTarget(-2, SEQUENCE_CHAPTERS)).toEqual({ index: 0, time: 0.15 });
    expect(chapterJumpTarget(99, SEQUENCE_CHAPTERS)).toEqual({ index: 4, time: 27.65 });
    expect(CHAPTER_JUMP_OFFSET).toBe(0.15);
  });

  it('resolves NaN to the first chapter', () => {
    expect(chapterJumpTarget(Number.NaN, SEQUENCE_CHAPTERS)).toEqual({ index: 0, time: 0.15 });
  });
});

describe('clampFrameStyle', () => {
  it('passes the signature style through by value', () => {
    const clamped = clampFrameStyle(DEFAULT_FRAME_STYLE);

    expect(clamped.intricacy).toBe(DEFAULT_FRAME_STYLE.intricacy);
    expect(clamped.formula.source).toBe(DEFAULT_FRAME_STYLE.formula.source);
    expect(clamped.formula.level).toBe(2);
    expect(clamped.formula.genome).toEqual(DEFAULT_FRAME_STYLE.formula.genome);
  });

  it('pulls wild values back into range', () => {
    const clamped = clampFrameStyle({
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

    expect(clamped.intricacy).toBe(1);
    expect(clamped.formula.level).toBe(4);
    expect(clamped.formula.genome).toEqual(
      clampGenome({ ...SIGNATURE_GENOME, cornerScale: 12, rayDensity: Number.NaN }),
    );
    expect(Number.isFinite(clamped.formula.genome.rayDensity)).toBe(true);
    expect(clamped.formula.layers).toEqual([
      { source: 'rosette', enabled: true, level: 1 },
      { source: 'arcade', enabled: false, level: 3 },
    ]);
  });

  it('rounds and clamps the formula level to 1..4', () => {
    expect(clampFrameStyle(frameStyle({ level: -3 })).formula.level).toBe(1);
    expect(clampFrameStyle(frameStyle({ level: 2.6 })).formula.level).toBe(3);
    expect(clampFrameStyle(frameStyle({ level: 40 })).formula.level).toBe(4);
  });

  it('defaults a missing layer list to none instead of crashing the rig', () => {
    const clamped = clampFrameStyle({
      intricacy: 0,
      formula: { source: 'fractal', level: -3, genome: { ...SIGNATURE_GENOME } },
    });

    expect(clamped.intricacy).toBe(0);
    expect(clamped.formula.level).toBe(1);
    expect(clamped.formula.layers).toEqual([]);
  });

  it('copies the layers rather than aliasing them', () => {
    const layers = [{ source: 'fractal' as const, enabled: true, level: 2 }];
    const clamped = clampFrameStyle(frameStyle({ layers }));

    expect(clamped.formula.layers).not.toBe(layers);
    expect(clamped.formula.layers?.[0]).not.toBe(layers[0]);
  });

  it('never mutates its input', () => {
    const input = frameStyle({ level: 9 }, 5);

    clampFrameStyle(input);

    expect(input.intricacy).toBe(5);
    expect(input.formula.level).toBe(9);
  });
});

describe('clampScreenBorderStyle', () => {
  it('clamps weight and routes the genome through clampGenome', () => {
    const wild = { ...DEFAULT_SCREEN_BORDER_STYLE.genome, wingSweep: 9 };
    const clamped = clampScreenBorderStyle({ weight: -2, genome: wild });

    expect(clamped.weight).toBe(0);
    expect(clamped.genome).toEqual(clampGenome(wild));
    expect(clampScreenBorderStyle({ weight: 7, genome: wild }).weight).toBe(1);
  });

  it('falls back to the default weight for NaN', () => {
    const clamped = clampScreenBorderStyle({
      weight: Number.NaN,
      genome: DEFAULT_SCREEN_BORDER_STYLE.genome,
    });

    expect(clamped.weight).toBe(DEFAULT_SCREEN_BORDER_STYLE.weight);
  });

  it('passes the default border through by value', () => {
    const clamped = clampScreenBorderStyle(DEFAULT_SCREEN_BORDER_STYLE);

    expect(clamped.weight).toBe(DEFAULT_SCREEN_BORDER_STYLE.weight);
    expect(clamped.genome).toEqual(DEFAULT_SCREEN_BORDER_STYLE.genome);
    expect(clamped.genome).not.toBe(DEFAULT_SCREEN_BORDER_STYLE.genome);
  });

  it('never mutates its input', () => {
    const input = { weight: 5, genome: { ...DEFAULT_SCREEN_BORDER_STYLE.genome } };

    clampScreenBorderStyle(input);

    expect(input.weight).toBe(5);
  });

  // PR #6 found that dropping the lattice `pattern` and `seed` here silently pinned the
  // border to the printed poster edge. Those fields land with the lattice work; until
  // then the guarantee is structural: every field this module does not own passes through.
  it('passes through any field it does not own, such as the lattice pattern and seed', () => {
    const input = { weight: 0.3, genome: { ...SIGNATURE_GENOME }, pattern: 'lattice', seed: 1925 };

    const clamped = clampScreenBorderStyle(input) as typeof input;

    expect(clamped.pattern).toBe('lattice');
    expect(clamped.seed).toBe(1925);
  });
});
