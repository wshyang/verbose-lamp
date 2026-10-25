import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  CHAPTER_JUMP_OFFSET,
  LAST_FRAME_EPSILON,
  chapterJumpTarget,
  clampChapterIndex,
  clampSequenceTime,
} from './styleClamp';

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
