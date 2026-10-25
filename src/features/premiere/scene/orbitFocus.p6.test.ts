// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { ORBIT_CAMERA_OFFSET, ORBIT_HOLD_LOCAL, ORBIT_HOLD_WINDOW, chapterLocalTime, orbitCameraPosition, orbitFocusPlan, orbitTimeFor, shouldAdvanceOrbit } from './orbitFocus';

/**
 * The orbit hand-off rule, lifted out of the scene manager (ADDENDUM-022 §6 step
 * 2.3). Its numbers are part of the look: the camera stands 9.2 units back and 2.4
 * to the side, and a card entered near its top or tail is snapped into the hold.
 */
const chapter_p6 = SEQUENCE_CHAPTERS[1];
describe('chapterLocalTime', () => {
  it('runs 0…1 across the chapter and keeps going outside it', () => {
    expect(chapterLocalTime(chapter_p6.startTime, chapter_p6)).toBe(0);
    expect(chapterLocalTime(chapter_p6.endTime, chapter_p6)).toBe(1);
    expect(chapterLocalTime((chapter_p6.startTime + chapter_p6.endTime) / 2, chapter_p6)).toBeCloseTo(0.5, 9);
    expect(chapterLocalTime(chapter_p6.startTime - 1, chapter_p6)).toBeLessThan(0);
  });

  it('answers 0 for a degenerate chapter instead of dividing by zero', () => {
    expect(chapterLocalTime(3, { ...chapter_p6, startTime: 3, endTime: 3 })).toBe(0);
  });
});
describe('shouldAdvanceOrbit', () => {
  it('snaps from outside the hold window only', () => {
    expect(shouldAdvanceOrbit(0)).toBe(true);
    expect(shouldAdvanceOrbit(ORBIT_HOLD_WINDOW.enter - 0.01)).toBe(true);
    expect(shouldAdvanceOrbit(ORBIT_HOLD_WINDOW.enter)).toBe(false);
    expect(shouldAdvanceOrbit(0.6)).toBe(false);
    expect(shouldAdvanceOrbit(ORBIT_HOLD_WINDOW.exit)).toBe(false);
    expect(shouldAdvanceOrbit(ORBIT_HOLD_WINDOW.exit + 0.01)).toBe(true);
  });
});
describe('orbitTimeFor', () => {
  it('lands in the middle of the hold', () => {
    const target = orbitTimeFor(chapter_p6);
    const local = chapterLocalTime(target, chapter_p6);

    expect(local).toBeCloseTo(ORBIT_HOLD_LOCAL, 9);
    expect(shouldAdvanceOrbit(local)).toBe(false);
  });
});
describe('orbitCameraPosition', () => {
  it('stands off the card in Z and to the side in X', () => {
    expect(orbitCameraPosition(chapter_p6)).toEqual({
      x: ORBIT_CAMERA_OFFSET.x,
      y: ORBIT_CAMERA_OFFSET.y,
      z: chapter_p6.zPosition + ORBIT_CAMERA_OFFSET.z,
    });
  });
});
describe('orbitFocusPlan', () => {
  it('reports no time change when the guest is already inside the hold', () => {
    const plan = orbitFocusPlan(orbitTimeFor(chapter_p6), chapter_p6);

    expect(plan.time).toBeNull();
    expect(plan.target).toEqual([0, 0, chapter_p6.zPosition]);
    expect(plan.position).toEqual([ORBIT_CAMERA_OFFSET.x, ORBIT_CAMERA_OFFSET.y, chapter_p6.zPosition + ORBIT_CAMERA_OFFSET.z]);
  });

  it('asks for the hold when the chapter has only just started', () => {
    const plan = orbitFocusPlan(chapter_p6.startTime + 0.01, chapter_p6);

    expect(plan.time).toBeCloseTo(orbitTimeFor(chapter_p6), 9);
  });
});
