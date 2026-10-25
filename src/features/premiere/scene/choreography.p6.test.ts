// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).

import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { activeChapterIndex, cinemaCameraZ, greenLight, lerp, lightRig, rigAnchors, searchlightSway, smoothstep } from './choreography';

/**
 * The premiere's timing, pinned (ADDENDUM-022 §6 step 0.7). The screenshot gate
 * proves the picture did not move; these prove *why* it did not move, and they run
 * in milliseconds. The sampling golden at the bottom is the safety net for the
 * whole 38-second sequence.
 */
const chapters = SEQUENCE_CHAPTERS;
describe('smoothstep', () => {
  it('clamps outside the window and is symmetric about its midpoint', () => {
    expect(smoothstep(-1, 0, 1)).toBe(0);
    expect(smoothstep(2, 0, 1)).toBe(1);
    expect(smoothstep(0.5, 0, 1)).toBeCloseTo(0.5, 12);
    expect(smoothstep(0.25, 0, 1) + smoothstep(0.75, 0, 1)).toBeCloseTo(1, 12);
  });
});
describe('activeChapterIndex', () => {
  it('hands over exactly at each start time', () => {
    for (let index = 0; index < chapters.length; index += 1) {
      const { startTime } = chapters[index];
      expect(activeChapterIndex(startTime, chapters)).toBe(index);
      expect(activeChapterIndex(startTime + 1e-6, chapters)).toBe(index);
      if (index > 0) expect(activeChapterIndex(startTime - 1e-6, chapters)).toBe(index - 1);
    }
    // Below zero there is no chapter; the lookup falls to the last one, exactly as it
    // always has. Playback never asks (the clock wraps at 38 s), so this is a guard.
    expect(activeChapterIndex(-0.1, chapters)).toBe(chapters.length - 1);
  });

  it('gives every overshoot to the last chapter', () => {
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION, chapters)).toBe(chapters.length - 1);
    expect(activeChapterIndex(1e6, chapters)).toBe(chapters.length - 1);
  });
});
describe('cinemaCameraZ', () => {
  const at = (activeIdx: number, chapterLocal: number, extraPullback = 0) =>
    cinemaCameraZ({ chapters, activeIdx, chapterLocal, pullback: extraPullback });

  it('pushes in during the hold, from 12.2 to 9.0 in front of the card', () => {
    const chapter = chapters[0];

    expect(at(0, 0)).toBeCloseTo(chapter.zPosition + 12.2, 6);
    expect(at(0, 0.78)).toBeCloseTo(chapter.zPosition + 9.0, 6);
    // Monotonic: the camera never backs away mid-hold.
    let previous = Infinity;
    for (let local = 0; local <= 0.78; local += 0.05) {
      const z = at(0, local);
      expect(z).toBeLessThan(previous);
      previous = z;
    }
  });

  it('flies through the portal to the next chamber after 0.78', () => {
    const next = chapters[1];

    expect(at(0, 1)).toBeCloseTo(next.zPosition + 12.2, 6);
    // Half way through the fly the eased midpoint sits between the two chambers.
    const middle = at(0, 0.89);
    expect(middle).toBeLessThan(at(0, 0.78));
    expect(middle).toBeGreaterThan(at(0, 1));
  });

  it('gives the finale a longer approach and a slow drift', () => {
    const hero = chapters[chapters.length - 1];
    const finale = (local: number) => at(chapters.length - 1, local);

    expect(finale(0)).toBeCloseTo(hero.zPosition + 15.2, 6);
    // The hold distance is reached at 0.52, by which point the drift has already
    // taken 0.52 * 0.75 off the camera.
    expect(finale(0.52)).toBeCloseTo(hero.zPosition + 12.4 - 0.52 * 0.75, 6);
    // After the ease completes, the drift keeps pulling the camera in.
    expect(finale(1)).toBeLessThan(finale(0.52));
    expect(finale(0.52) - finale(1)).toBeCloseTo(0.48 * 0.75, 6);
  });

  it('pulls back by the aspect correction on narrow viewports', () => {
    expect(at(0, 0, 5.8) - at(0, 0, 0)).toBeCloseTo(5.8, 6);
    // The hold's end distance only takes 85 % of the pull-back, so the push-in
    // is slightly longer on a phone — deliberate, and pinned here.
    expect(at(0, 0.78, 5.8) - at(0, 0.78, 0)).toBeCloseTo(5.8 * 0.85, 6);
  });
});
// The intensity does not depend on the hero depth; this branch's greenLight takes it as a number.
const HERO_Z = -108;
describe('greenLight', () => {
  it('lights Act I and fades out by 7.6 s', () => {
    expect(greenLight(0, HERO_Z).intensity).toBeCloseTo(1, 6);
    expect(greenLight(4.8, HERO_Z).intensity).toBeCloseTo(1, 6);
    expect(greenLight(6.2, HERO_Z).intensity).toBeCloseTo(0.5, 2);
    expect(greenLight(7.6, HERO_Z).intensity).toBe(0);
  });

  it('returns as a quieter bookend behind the hero card', () => {
    expect(greenLight(34.8, HERO_Z).intensity).toBe(0);
    expect(greenLight(36.2, HERO_Z).intensity).toBeGreaterThan(0.2);
    expect(greenLight(38, HERO_Z).intensity).toBeCloseTo(0.65, 6);
  });

  it('hides itself below the visible threshold between the two', () => {
    expect(greenLight(20, HERO_Z).intensity).toBeLessThan(0.01);
  });
});
describe('searchlightSway', () => {
  it('counter-sways around ±0.36 rad', () => {
    for (let elapsed = 0; elapsed < 40; elapsed += 0.7) {
      const sway = searchlightSway(elapsed);
      expect(Math.abs(sway.left + 0.36)).toBeLessThanOrEqual(0.14 + 1e-9);
      expect(Math.abs(sway.right - 0.36)).toBeLessThanOrEqual(0.14 + 1e-9);
    }
    expect(searchlightSway(0)).toEqual({ left: -0.36, right: 0.5 });
  });
});
describe('lightRig', () => {
  it('orbits the key and rim lights around the focus plane', () => {
    const rig = lightRig(0, -6.5);

    expect(rig.key).toEqual([0, 4.0, -3.3]);
    expect(rig.rim).toEqual([-6, -2.2, -5.0]);
    expect(rig.cool).toEqual([0, 4.5, -8.5]);
  });

  it('keeps the cool light overhead and behind the focus plane at all times', () => {
    for (let elapsed = 0; elapsed < 30; elapsed += 1.3) {
      const rig = lightRig(elapsed, 10);
      expect(rig.cool[1]).toBe(4.5);
      expect(rig.cool[2]).toBe(8);
      expect(Math.abs(rig.key[0])).toBeLessThanOrEqual(5.5);
      expect(Math.abs(rig.rim[0])).toBeLessThanOrEqual(6);
    }
  });
});
describe('rigAnchors', () => {
  it('follows the camera in cinema mode and the card in orbit mode', () => {
    expect(rigAnchors({ cameraMode: 'cinema', cameraZ: 10.5, chapterZ: -26 })).toEqual({
      backdropZ: -1.5,
      lightZ: 4,
    });
    expect(rigAnchors({ cameraMode: 'orbit', cameraZ: 10.5, chapterZ: -26 })).toEqual({
      backdropZ: -29.5,
      lightZ: -22.5,
    });
  });
});
describe('lerp', () => {
  it('interpolates and clamps nothing', () => {
    expect(lerp(2, 4, 0)).toBe(2);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(lerp(2, 4, 1)).toBe(4);
    expect(lerp(2, 4, 2)).toBe(6);
  });
});
