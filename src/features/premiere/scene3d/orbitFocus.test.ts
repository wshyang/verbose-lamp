import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { ORBIT_HOLD_POINT, ORBIT_HOLD_WINDOW, orbitFocusTime, orbitPose } from './orbitFocus';

const chapter = SEQUENCE_CHAPTERS[1]; // 7.2 → 14.0
const duration = chapter.endTime - chapter.startTime;

describe('orbitFocusTime', () => {
  it('leaves the playhead alone when it is already in the hold', () => {
    const currentTime = chapter.startTime + duration * 0.6;
    expect(orbitFocusTime({ currentTime, chapter })).toEqual({ time: currentTime, pause: false });
  });

  it('accepts both window edges without pausing', () => {
    for (const edge of [ORBIT_HOLD_WINDOW.from, ORBIT_HOLD_WINDOW.to]) {
      const currentTime = chapter.startTime + duration * edge;
      expect(orbitFocusTime({ currentTime, chapter }).pause).toBe(false);
    }
  });

  it('moves to the hold point and pauses when the camera is mid-flight', () => {
    const early = orbitFocusTime({ currentTime: chapter.startTime, chapter });
    expect(early.pause).toBe(true);
    expect(early.time).toBeCloseTo(chapter.startTime + duration * ORBIT_HOLD_POINT, 10);

    const late = orbitFocusTime({ currentTime: chapter.endTime - 0.01, chapter });
    expect(late.pause).toBe(true);
  });
});

describe('orbitPose', () => {
  it('looks at the card from a three-quarter angle in front of it', () => {
    expect(orbitPose(chapter)).toEqual({
      position: [2.4, 0.9, chapter.zPosition + 9.2],
      target: [0, 0, chapter.zPosition],
    });
  });
});
