import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  clampChapterIndex,
  clampFrameStyle,
  clampScreenBorderStyle,
  clampTime,
  jumpTimeForChapter,
} from './styleClamp';

describe('clampTime', () => {
  it('clamps into [0, duration)', () => {
    expect(clampTime(-5)).toBe(0);
    expect(clampTime(10)).toBe(10);
    expect(clampTime(TOTAL_SEQUENCE_DURATION + 5)).toBeCloseTo(TOTAL_SEQUENCE_DURATION - 0.001, 10);
  });
});

describe('clampChapterIndex / jumpTimeForChapter', () => {
  it('clamps the index and lands 0.15 s into the chapter', () => {
    expect(clampChapterIndex(-1, 5)).toBe(0);
    expect(clampChapterIndex(3, 5)).toBe(3);
    expect(clampChapterIndex(99, 5)).toBe(4);
    SEQUENCE_CHAPTERS.forEach((chapter, index) => {
      expect(jumpTimeForChapter({ index, chapters: SEQUENCE_CHAPTERS }))
        .toBeCloseTo(chapter.startTime + 0.15, 10);
    });
    expect(jumpTimeForChapter({ index: 99, chapters: SEQUENCE_CHAPTERS }))
      .toBeCloseTo(SEQUENCE_CHAPTERS[4].startTime + 0.15, 10);
  });
});

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

describe('clampScreenBorderStyle', () => {
  it('clamps the weight and preserves the pattern', () => {
    expect(clampScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: -1 }).weight).toBe(0);
    expect(clampScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: 3 }).weight).toBe(1);
    const lattice = clampScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, pattern: 'lattice' });
    expect(lattice.pattern).toBe('lattice');
    expect(clampScreenBorderStyle(DEFAULT_SCREEN_BORDER_STYLE).pattern).toBeUndefined();
  });
});
