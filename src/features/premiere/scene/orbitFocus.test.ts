import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import {
  ORBIT_HOLD_END,
  ORBIT_HOLD_START,
  ORBIT_HOLD_TARGET,
  orbitChapterIndex,
  planOrbitFocus,
} from './orbitFocus';

describe('planOrbitFocus', () => {
  it('frames the chapter and seeks into the hold when the playhead is at the very start', () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    const plan = planOrbitFocus(SEQUENCE_CHAPTERS, 1, chapter.startTime);

    expect(plan.camera).toEqual([2.4, 0.9, chapter.zPosition + 9.2]);
    expect(plan.target).toEqual([0, 0, chapter.zPosition]);
    expect(plan.seekTime).toBeCloseTo(
      chapter.startTime + (chapter.endTime - chapter.startTime) * ORBIT_HOLD_TARGET,
      6,
    );
  });

  it('leaves the playhead alone while it is inside the hold window', () => {
    const chapter = SEQUENCE_CHAPTERS[2];
    const duration = chapter.endTime - chapter.startTime;
    expect(ORBIT_HOLD_START).toBeLessThan(ORBIT_HOLD_END);

    const inside = chapter.startTime + duration * ((ORBIT_HOLD_START + ORBIT_HOLD_END) / 2);
    expect(planOrbitFocus(SEQUENCE_CHAPTERS, 2, inside).seekTime).toBeNull();
  });

  it('seeks back into the hold when the playhead is already flying out', () => {
    const chapter = SEQUENCE_CHAPTERS[3];
    const flying = chapter.startTime + (chapter.endTime - chapter.startTime) * 0.95;
    expect(planOrbitFocus(SEQUENCE_CHAPTERS, 3, flying).seekTime).not.toBeNull();
  });

  it('falls back to the last chapter for an index outside the sequence', () => {
    const last = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1];
    expect(planOrbitFocus(SEQUENCE_CHAPTERS, 99, 0).target[2]).toBe(last.zPosition);
  });
});

describe('orbitChapterIndex', () => {
  it('reads the chapter under the playhead', () => {
    expect(orbitChapterIndex(SEQUENCE_CHAPTERS, 0)).toBe(0);
    expect(orbitChapterIndex(SEQUENCE_CHAPTERS, 11.28)).toBe(1);
    expect(orbitChapterIndex(SEQUENCE_CHAPTERS, 99)).toBe(4);
  });
});
