import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { orbitFocusFor } from './orbitFocus';

describe('orbitFocusFor (ADDENDUM-022 §2.3)', () => {
  it('frames the chapter card from up-stage right', () => {
    const chapter = SEQUENCE_CHAPTERS[2];
    const focus = orbitFocusFor({ chapter, currentTime: chapter.startTime + 3 });
    expect(focus.target).toEqual([0, 0, -52]);
    expect(focus.cameraPosition).toEqual([2.4, 0.9, -42.8]);
  });

  it('advances into the hold and pauses when outside 0.42..0.85', () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    const duration = chapter.endTime - chapter.startTime;
    const early = orbitFocusFor({ chapter, currentTime: chapter.startTime });
    expect(early.advanceToTime).toBeCloseTo(chapter.startTime + duration * 0.56, 10);
    const late = orbitFocusFor({ chapter, currentTime: chapter.startTime + duration * 0.9 });
    expect(late.advanceToTime).toBeCloseTo(chapter.startTime + duration * 0.56, 10);
  });

  it('leaves playback alone inside the hold window, boundaries included', () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    const duration = chapter.endTime - chapter.startTime;
    for (const local of [0.42, 0.56, 0.85]) {
      const focus = orbitFocusFor({ chapter, currentTime: chapter.startTime + duration * local });
      expect(focus.advanceToTime).toBeNull();
    }
  });
});
