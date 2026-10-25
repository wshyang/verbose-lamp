import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  CARD_PHASE_WINDOW,
  FORCED_NITRATE,
  activeChapterIndex,
  cardPhase,
  clamp01,
  cinemaCameraZ,
  greenLight,
  lerp,
  lightRig,
  openingNitrate,
  rigAnchors,
  searchlightSway,
  smoothstep,
} from './choreography';

/**
 * The premiere's timing, pinned (ADDENDUM-022 §6 step 0.7). The screenshot gate
 * proves the picture did not move; these prove *why* it did not move, and they run
 * in milliseconds. The sampling golden at the bottom is the safety net for the
 * whole 38-second sequence.
 */
const chapters = SEQUENCE_CHAPTERS;

describe('smoothstep', () => {
  it('matches three\'s implementation across the whole curve', () => {
    for (let i = 0; i <= 50; i += 1) {
      const x = -0.5 + i * 0.05;
      expect(smoothstep(x, 0.1, 0.9)).toBeCloseTo(THREE.MathUtils.smoothstep(x, 0.1, 0.9), 12);
    }
  });

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

describe('cardPhase', () => {
  it('is fully transparent outside its window', () => {
    const [enter, exit] = CARD_PHASE_WINDOW;
    for (const localT of [enter - 0.01, exit + 0.01, -5, 5]) {
      expect(cardPhase(localT, false)).toEqual({
        drawProgress: 0,
        textProgress: 0,
        partOpen: 0,
        opacity: 0,
      });
    }
  });

  it('draws the frame, then the type, then parts the gate', () => {
    const early = cardPhase(0.02, false);
    const mid = cardPhase(0.45, false);
    const late = cardPhase(0.95, false);

    expect(early.drawProgress).toBeGreaterThan(0);
    expect(early.textProgress).toBe(0);
    expect(early.partOpen).toBe(0);

    expect(mid.drawProgress).toBe(1);
    expect(mid.textProgress).toBeGreaterThan(0.9);
    expect(mid.partOpen).toBe(0);
    expect(mid.opacity).toBeCloseTo(1, 6);

    expect(late.partOpen).toBeGreaterThan(0.5);
    expect(late.opacity).toBeLessThan(1);
  });

  it('never parts the finale card, and holds it longer before fading', () => {
    expect(cardPhase(0.9, true).partOpen).toBe(0);
    expect(cardPhase(0.9, true).opacity).toBeCloseTo(1, 6);
    // The finale starts fading at 0.91 and is a little over half gone at 0.95.
    expect(cardPhase(0.95, true).opacity).toBeLessThan(0.6);
    // Gone by 0.995, while a flying card is still faintly visible a moment longer.
    expect(cardPhase(1.02, true).opacity).toBe(0);
    expect(cardPhase(1.02, false).opacity).toBeGreaterThan(0);
  });

  it('fades on the same curve, over each window', () => {
    // The finale bows out on [0.91, 0.995]; the others on [0.94, 1.08]. Same curve,
    // different windows, so equal progress through each window means equal opacity.
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const finale = 0.91 + (0.995 - 0.91) * fraction;
      const normal = 0.94 + (1.08 - 0.94) * fraction;
      expect(cardPhase(finale, true).opacity).toBeCloseTo(cardPhase(normal, false).opacity, 12);
    }
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

describe('greenLight', () => {
  it('lights Act I and fades out by 7.6 s', () => {
    expect(greenLight(0, chapters).intensity).toBeCloseTo(1, 6);
    expect(greenLight(4.8, chapters).intensity).toBeCloseTo(1, 6);
    expect(greenLight(6.2, chapters).intensity).toBeCloseTo(0.5, 2);
    expect(greenLight(7.6, chapters).intensity).toBe(0);
  });

  it('returns as a quieter bookend behind the hero card', () => {
    expect(greenLight(34.8, chapters).intensity).toBe(0);
    expect(greenLight(36.2, chapters).intensity).toBeGreaterThan(0.2);
    expect(greenLight(38, chapters).intensity).toBeCloseTo(0.65, 6);
  });

  it('hides itself below the visible threshold between the two', () => {
    expect(greenLight(20, chapters).intensity).toBeLessThan(0.01);
  });

  it('moves behind the hero card once the ballroom is done', () => {
    expect(greenLight(29.9, chapters).z).toBe(-7.5);
    expect(greenLight(30.1, chapters).z).toBe(chapters[chapters.length - 1].zPosition - 7.5);
  });
});

describe('openingNitrate', () => {
  it('starts at 82 % of the effect and is gone by 2.55 s', () => {
    expect(openingNitrate(0)).toBeCloseTo(0.82, 6);
    expect(openingNitrate(2.55)).toBe(0);
    expect(openingNitrate(5)).toBe(0);
  });

  it('is weaker than the forced filter', () => {
    expect(openingNitrate(0)).toBeLessThan(FORCED_NITRATE);
    expect(FORCED_NITRATE).toBe(0.92);
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

describe('clamp01', () => {
  it('holds the ends and passes the middle through', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(7)).toBe(1);
  });

  it('is the clamp every window in this module relies on', () => {
    // `cardPhase` fades across a two-sided window: nothing outside it may exceed 1.
    for (const localT of [-1, 0, 0.5, 1, 1.5, 4]) {
      const phase = cardPhase(localT, false);
      expect(phase.opacity).toBe(clamp01(phase.opacity));
    }
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

describe('the whole sequence', () => {
  it('samples every function every 0.25 s and matches the recorded curve', () => {
    const frames: string[] = [];
    for (let t = 0; t <= TOTAL_SEQUENCE_DURATION; t += 0.25) {
      const index = activeChapterIndex(t, chapters);
      const chapter = chapters[index];
      const local = Math.min(1, Math.max(0, (t - chapter.startTime) / (chapter.endTime - chapter.startTime)));
      const phase = cardPhase(local, index === chapters.length - 1);
      const beacon = greenLight(t, chapters);
      const sway = searchlightSway(t);
      const rig = lightRig(t, 0);
      frames.push(
        [
          t.toFixed(2),
          index,
          phase.drawProgress.toFixed(4),
          phase.textProgress.toFixed(4),
          phase.partOpen.toFixed(4),
          phase.opacity.toFixed(4),
          cinemaCameraZ({ chapters, activeIdx: index, chapterLocal: local, pullback: 0 }).toFixed(3),
          beacon.intensity.toFixed(4),
          beacon.z.toFixed(2),
          openingNitrate(t).toFixed(4),
          sway.left.toFixed(4),
          sway.right.toFixed(4),
          ...rig.key.map((n) => n.toFixed(3)),
          ...rig.cool.map((n) => n.toFixed(3)),
        ].join(',')
      );
    }
    expect(frames).toMatchSnapshot();
  });
});
