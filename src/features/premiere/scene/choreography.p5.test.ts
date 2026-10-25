// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).

import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { activeChapterIndex, cardPhase, cinemaCameraZ, greenLight } from './choreography';

describe('activeChapterIndex', () => {
  it('hands over exactly at each chapter start', () => {
    SEQUENCE_CHAPTERS.forEach((chapter, index) => {
      expect(activeChapterIndex(chapter.startTime, SEQUENCE_CHAPTERS)).toBe(index);
      expect(activeChapterIndex(chapter.startTime + 0.01, SEQUENCE_CHAPTERS)).toBe(index);
    });
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION + 5, SEQUENCE_CHAPTERS)).toBe(4);
    expect(activeChapterIndex(-1, SEQUENCE_CHAPTERS)).toBe(4);
  });
});
describe('cardPhase boundaries', () => {
  it('is invisible outside the [-0.18, 1.18] window', () => {
    const invisible = { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };
    expect(cardPhase({ localT: -0.2, role: 'standard' })).toEqual(invisible);
    expect(cardPhase({ localT: 1.2, role: 'finale' })).toEqual(invisible);
  });

  it('holds full opacity mid-card and completes draw and text', () => {
    const hold = cardPhase({ localT: 0.6, role: 'standard' });
    expect(hold).toEqual({ drawProgress: 1, textProgress: 1, partOpen: 0, opacity: 1 });
  });
});
describe('nitrate and green light curves', () => {
  it('green light burns in Act I, sleeps mid-sequence, returns as bookend', () => {
    const heroZ = SEQUENCE_CHAPTERS[4].zPosition;
    expect(greenLight(1, heroZ)).toEqual({ intensity: 1, z: -7.5 });
    expect(greenLight(20, heroZ).intensity).toBe(0);
    const bookend = greenLight(37.6, heroZ);
    expect(bookend.intensity).toBeCloseTo(0.65, 12);
    expect(bookend.z).toBe(heroZ - 7.5);
  });
});
describe('camera, sway, lights and anchors', () => {
  it('camera holds, flies and settles into the finale at the right depths', () => {
    const base = { chapters: SEQUENCE_CHAPTERS, pullback: 0 };
    expect(cinemaCameraZ({ ...base, activeIdx: 0, chapterLocal: 0 })).toBeCloseTo(12.2, 9);
    expect(cinemaCameraZ({ ...base, activeIdx: 0, chapterLocal: 0.78 })).toBeCloseTo(9.0, 9);
    // End of the fly-through lands at the next chamber's start distance.
    expect(cinemaCameraZ({ ...base, activeIdx: 0, chapterLocal: 1 })).toBeCloseTo(-26 + 12.2, 9);
    // Chapter IV flies into the finale's longer start distance.
    expect(cinemaCameraZ({ ...base, activeIdx: 3, chapterLocal: 1 })).toBeCloseTo(-108 + 15.2, 9);
    // Finale: hero framing minus the slow drift.
    expect(cinemaCameraZ({ ...base, activeIdx: 4, chapterLocal: 1 })).toBeCloseTo(-108 + 12.4 - 0.75, 9);
    expect(cinemaCameraZ({ chapters: SEQUENCE_CHAPTERS, activeIdx: 0, chapterLocal: 0, pullback: 2 }))
      .toBeCloseTo(14.2, 9);
  });
});
