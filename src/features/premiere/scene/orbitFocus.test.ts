import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import {
  ORBIT_CAMERA_OFFSET,
  ORBIT_HOLD_LOCAL,
  ORBIT_HOLD_WINDOW,
  chapterLocalTime,
  orbitCameraPosition,
  orbitFocusPlan,
  orbitTimeFor,
  shouldAdvanceOrbit,
} from './orbitFocus';

const chapter = { startTime: 10, endTime: 20, zPosition: -26 };

describe('chapterLocalTime', () => {
  it('is 0 at the start, 1 at the end, and runs past both ends', () => {
    expect(chapterLocalTime(10, chapter)).toBe(0);
    expect(chapterLocalTime(15, chapter)).toBe(0.5);
    expect(chapterLocalTime(20, chapter)).toBe(1);
    expect(chapterLocalTime(8, chapter)).toBeCloseTo(-0.2, 12);
    expect(chapterLocalTime(23, chapter)).toBeCloseTo(1.3, 12);
  });

  it('is 0 for a chapter with no duration instead of dividing by zero', () => {
    expect(chapterLocalTime(5, { startTime: 4, endTime: 4, zPosition: 0 })).toBe(0);
    expect(chapterLocalTime(5, { startTime: 6, endTime: 4, zPosition: 0 })).toBe(0);
  });
});

describe('shouldAdvanceOrbit', () => {
  it('leaves the clock alone inside the hold window', () => {
    for (const local of [0.42, 0.5, 0.56, 0.7, 0.85]) {
      expect(shouldAdvanceOrbit(local)).toBe(false);
    }
  });

  it('advances the clock outside the hold window', () => {
    for (const local of [-0.1, 0, 0.2, 0.41, 0.86, 0.95, 1, 1.2]) {
      expect(shouldAdvanceOrbit(local)).toBe(true);
    }
  });

  // Float noise puts a time placed exactly on an edge a hair outside it: on chapters
  // two to four, the 0.85 edge computes to 0.8500000000000001. The shipped rule would
  // jump (and pause playback) for a guest who is, to the millisecond, inside the hold.
  it('treats float noise on the window edges as inside the window', () => {
    expect(shouldAdvanceOrbit(0.8500000000000001)).toBe(false);
    expect(shouldAdvanceOrbit(0.4199999999999999)).toBe(false);
  });

  it('still advances for a genuine miss just outside either edge', () => {
    expect(shouldAdvanceOrbit(0.85 + 1e-6)).toBe(true);
    expect(shouldAdvanceOrbit(0.42 - 1e-6)).toBe(true);
  });

  it('never advances for the exact edge times of any real chapter', () => {
    for (const real of SEQUENCE_CHAPTERS) {
      for (const edge of [ORBIT_HOLD_WINDOW.enter, ORBIT_HOLD_WINDOW.exit]) {
        const time = real.startTime + (real.endTime - real.startTime) * edge;
        expect(shouldAdvanceOrbit(chapterLocalTime(time, real))).toBe(false);
      }
    }
  });
});

describe('orbitTimeFor', () => {
  it('snaps to the middle of the hold', () => {
    expect(orbitTimeFor(chapter)).toBeCloseTo(15.6, 12);
    expect(ORBIT_HOLD_LOCAL).toBe(0.56);
  });

  it('lands inside the hold window for every real chapter', () => {
    for (const real of SEQUENCE_CHAPTERS) {
      const local = chapterLocalTime(orbitTimeFor(real), real);

      expect(shouldAdvanceOrbit(local)).toBe(false);
    }
  });
});

describe('orbitCameraPosition', () => {
  it('stands off to the side of the card, relative to its Z plane', () => {
    expect(orbitCameraPosition(chapter)).toEqual({ x: 2.4, y: 0.9, z: -26 + 9.2 });
    expect(ORBIT_CAMERA_OFFSET).toEqual({ x: 2.4, y: 0.9, z: 9.2 });
  });
});

describe('orbitFocusPlan', () => {
  it('keeps the clock when the guest is already inside the hold', () => {
    const plan = orbitFocusPlan(15.6, chapter);

    expect(plan.time).toBeNull();
    expect(plan.target).toEqual([0, 0, -26]);
    expect(plan.position).toEqual([2.4, 0.9, -26 + 9.2]);
  });

  it('moves the clock to the middle of the hold from the top of the card', () => {
    expect(orbitFocusPlan(10, chapter).time).toBeCloseTo(15.6, 12);
  });

  it('moves the clock to the middle of the hold from the tail of the card', () => {
    expect(orbitFocusPlan(19.5, chapter).time).toBeCloseTo(15.6, 12);
  });

  it('looks at the card’s own Z plane, whichever chapter it is', () => {
    for (const real of SEQUENCE_CHAPTERS) {
      expect(orbitFocusPlan(real.startTime, real).target).toEqual([0, 0, real.zPosition]);
    }
  });

  it('plans the same for any time inside one hold window', () => {
    const real = SEQUENCE_CHAPTERS[2];
    const at = (local: number) => real.startTime + (real.endTime - real.startTime) * local;

    expect(orbitFocusPlan(at(0.5), real)).toEqual(orbitFocusPlan(at(0.7), real));
  });
});
