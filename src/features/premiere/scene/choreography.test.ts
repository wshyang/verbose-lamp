import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  FORCED_NITRATE,
  activeChapterIndex,
  advanceTime,
  cardPhase,
  chapterProgress,
  cinemaCameraZ,
  greenLight,
  lightRig,
  nitrateLevel,
  openingNitrate,
  rigAnchors,
  searchlightSway,
  smoothPointer,
  smoothstep,
} from './choreography';

const chapters = SEQUENCE_CHAPTERS;

describe('smoothstep parity with THREE.MathUtils.smoothstep', () => {
  it('matches across 50 samples and several ranges', () => {
    const ranges: Array<[number, number]> = [[-0.04, 0.42], [0.14, 0.5], [0.35, 2.55], [4.8, 7.6]];
    for (const [min, max] of ranges) {
      for (let i = 0; i < 50; i += 1) {
        const x = min - 0.5 + (i / 49) * (max - min + 1);
        expect(smoothstep(x, min, max)).toBeCloseTo(THREE.MathUtils.smoothstep(x, min, max), 12);
      }
    }
  });
});

describe('activeChapterIndex', () => {
  it('hands over exactly at each startTime', () => {
    chapters.forEach((chapter, index) => {
      expect(activeChapterIndex({ time: chapter.startTime, chapters })).toBe(index);
      expect(activeChapterIndex({ time: chapter.endTime - 1e-9, chapters })).toBe(index);
    });
  });

  it('clamps times outside the sequence to the finale index', () => {
    expect(activeChapterIndex({ time: TOTAL_SEQUENCE_DURATION, chapters })).toBe(4);
    expect(activeChapterIndex({ time: 1000, chapters })).toBe(4);
  });
});

describe('chapterProgress', () => {
  it('is unclamped local progress', () => {
    const chapter = chapters[1];
    expect(chapterProgress({ time: chapter.startTime, chapter })).toBe(0);
    expect(chapterProgress({ time: chapter.endTime, chapter })).toBe(1);
    expect(chapterProgress({ time: chapter.startTime - 1, chapter })).toBeLessThan(0);
    expect(chapterProgress({ time: chapter.endTime + 1, chapter })).toBeGreaterThan(1);
  });
});

describe('cardPhase', () => {
  it('is fully zero outside [-0.18, 1.18]', () => {
    const zero = { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };
    expect(cardPhase({ localT: -0.2, variant: 'standard' })).toEqual(zero);
    expect(cardPhase({ localT: 1.2, variant: 'standard' })).toEqual(zero);
    expect(cardPhase({ localT: -0.19, variant: 'finale' })).toEqual(zero);
    expect(cardPhase({ localT: 1.19, variant: 'finale' })).toEqual(zero);
  });

  it('draws, reveals text, parts and fades a standard card', () => {
    const hold = cardPhase({ localT: 0.56, variant: 'standard' });
    expect(hold.drawProgress).toBe(1);
    expect(hold.textProgress).toBe(1);
    expect(hold.partOpen).toBe(0);
    expect(hold.opacity).toBe(1);
    const parting = cardPhase({ localT: 0.95, variant: 'standard' });
    expect(parting.partOpen).toBeGreaterThan(0);
    expect(parting.opacity).toBeLessThan(1);
    const entering = cardPhase({ localT: -0.1, variant: 'standard' });
    expect(entering.opacity).toBeGreaterThan(0);
    expect(entering.opacity).toBeLessThan(1);
    expect(entering.drawProgress).toBe(0);
  });

  it('finale never parts and fades earlier than a standard card', () => {
    for (const localT of [0.8, 0.95, 1.05, 1.18]) {
      expect(cardPhase({ localT, variant: 'finale' }).partOpen).toBe(0);
    }
    const finale = cardPhase({ localT: 0.96, variant: 'finale' });
    const standard = cardPhase({ localT: 0.96, variant: 'standard' });
    expect(finale.opacity).toBeLessThan(standard.opacity);
  });
});

describe('cinemaCameraZ', () => {
  it('pushes in during the hold (0..0.78)', () => {
    const at = (chapterLocal: number) => cinemaCameraZ({ chapters, activeIndex: 0, chapterLocal, pullback: 0 });
    expect(at(0)).toBeCloseTo(chapters[0].zPosition + 12.2, 10);
    expect(at(0.39)).toBeCloseTo(chapters[0].zPosition + 10.6, 10);
    expect(at(0.78)).toBeCloseTo(chapters[0].zPosition + 9.0, 10);
  });

  it('flies through to the next chamber (0.78..1.0)', () => {
    const at = (chapterLocal: number) => cinemaCameraZ({ chapters, activeIndex: 0, chapterLocal, pullback: 0 });
    expect(at(1)).toBeCloseTo(chapters[1].zPosition + 12.2, 10);
    const midway = at(0.89);
    expect(midway).toBeLessThan(at(0.78));
    expect(midway).toBeGreaterThan(at(1));
  });

  it('uses the wider start distance when flying into the finale', () => {
    const z = cinemaCameraZ({ chapters, activeIndex: 3, chapterLocal: 1, pullback: 0 });
    expect(z).toBeCloseTo(chapters[4].zPosition + 15.2, 10);
  });

  it('eases and drifts during the finale', () => {
    const at = (chapterLocal: number) => cinemaCameraZ({ chapters, activeIndex: 4, chapterLocal, pullback: 0 });
    expect(at(0)).toBeCloseTo(chapters[4].zPosition + 15.2, 10);
    expect(at(0.52)).toBeCloseTo(chapters[4].zPosition + 12.4 - 0.52 * 0.75, 10);
    expect(at(1)).toBeCloseTo(chapters[4].zPosition + 12.4 - 0.75, 10);
  });

  it('applies the aspect pullback', () => {
    const wide = cinemaCameraZ({ chapters, activeIndex: 0, chapterLocal: 0, pullback: 2 });
    expect(wide).toBeCloseTo(chapters[0].zPosition + 14.2, 10);
    const finale = cinemaCameraZ({ chapters, activeIndex: 4, chapterLocal: 0, pullback: 2 });
    expect(finale).toBeCloseTo(chapters[4].zPosition + 17.2, 10);
  });
});

describe('greenLight', () => {
  it('burns through Act I and returns as the finale bookend', () => {
    expect(greenLight({ time: 0, heroZ: -108 }).intensity).toBe(1);
    expect(greenLight({ time: 20, heroZ: -108 }).intensity).toBe(0);
    expect(greenLight({ time: 37.6, heroZ: -108 }).intensity).toBeCloseTo(0.65, 10);
  });

  it('moves behind the hero card after 30 s', () => {
    expect(greenLight({ time: 10, heroZ: -108 }).z).toBe(-7.5);
    expect(greenLight({ time: 30, heroZ: -108 }).z).toBe(-7.5);
    expect(greenLight({ time: 31, heroZ: -108 }).z).toBe(-115.5);
  });
});

describe('nitrate', () => {
  it('opening nitrate is 0.82 at t=0 and gone after 2.55 s', () => {
    expect(openingNitrate(0)).toBeCloseTo(0.82, 10);
    expect(openingNitrate(0.35)).toBeCloseTo(0.82, 10);
    expect(openingNitrate(2.55)).toBe(0);
    expect(openingNitrate(10)).toBe(0);
  });

  it('forced mode is the constant 0.92, auto follows the opening', () => {
    expect(FORCED_NITRATE).toBe(0.92);
    expect(nitrateLevel({ time: 20, mode: 'forced' })).toBe(0.92);
    expect(nitrateLevel({ time: 20, mode: 'auto' })).toBe(0);
    expect(nitrateLevel({ time: 0, mode: 'auto' })).toBeCloseTo(0.82, 10);
  });
});

describe('searchlightSway and lightRig', () => {
  it('sways around ±0.36', () => {
    const sway = searchlightSway(0);
    expect(sway.left).toBeCloseTo(-0.36, 10);
    expect(sway.right).toBeCloseTo(0.5, 10);
    for (let e = 0; e < 20; e += 0.5) {
      const s = searchlightSway(e);
      expect(Math.abs(s.left + 0.36)).toBeLessThanOrEqual(0.14 + 1e-9);
      expect(Math.abs(s.right - 0.36)).toBeLessThanOrEqual(0.14 + 1e-9);
    }
  });

  it('orbits key and rim around the focus, cool light fixed overhead', () => {
    const rig = lightRig({ elapsed: 0, focusZ: -20 });
    expect(rig.key).toEqual([0, 4, -16.8]);
    expect(rig.rim[0]).toBeCloseTo(-6, 10);
    expect(rig.rim[2]).toBe(-18.5);
    expect(rig.cool).toEqual([0, 4.5, -22]);
  });
});

describe('rigAnchors', () => {
  it('anchors to the camera in cinema mode, to the chapter in orbit mode', () => {
    expect(rigAnchors({ cameraMode: 'cinema', cameraZ: 10, chapterZ: -26 }))
      .toEqual({ backdropZ: -2, lightZ: 3.5 });
    expect(rigAnchors({ cameraMode: 'orbit', cameraZ: 10, chapterZ: -26 }))
      .toEqual({ backdropZ: -29.5, lightZ: -22.5 });
  });
});

describe('advanceTime', () => {
  it('frozen time never advances', () => {
    expect(advanceTime({ currentTime: 3, dt: 0.5, mode: 'frozen', frozenTime: 4.32 })).toBe(4.32);
    expect(advanceTime({ currentTime: 3, dt: 0.5, mode: 'frozen' })).toBe(3);
  });

  it('paused time stands still, playing time advances and wraps to 0', () => {
    expect(advanceTime({ currentTime: 3, dt: 0.5, mode: 'paused' })).toBe(3);
    expect(advanceTime({ currentTime: 3, dt: 0.04, mode: 'playing' })).toBeCloseTo(3.04, 10);
    expect(advanceTime({ currentTime: 37.99, dt: 0.04, mode: 'playing' })).toBe(0);
  });

  it('caps a frame step at 0.05 s', () => {
    expect(advanceTime({ currentTime: 3, dt: 5, mode: 'playing' })).toBeCloseTo(3.05, 10);
  });
});

describe('smoothPointer', () => {
  it('lerps toward the target and reaches it on a long frame', () => {
    const mid = smoothPointer({ current: { x: 0, y: 0 }, target: { x: 1, y: -1 }, dt: 0.1 });
    expect(mid.x).toBeCloseTo(0.45, 10);
    expect(mid.y).toBeCloseTo(-0.45, 10);
    expect(smoothPointer({ current: { x: 0, y: 0 }, target: { x: 1, y: 1 }, dt: 10 }))
      .toEqual({ x: 1, y: 1 });
  });

  it('does not mutate its inputs', () => {
    const current = { x: 0.25, y: 0.5 };
    smoothPointer({ current, target: { x: 1, y: 1 }, dt: 0.1 });
    expect(current).toEqual({ x: 0.25, y: 0.5 });
  });
});

describe('choreography golden sample', () => {
  it('every function sampled every 0.25 s over the whole sequence', () => {
    const samples = [];
    for (let t = 0; t <= TOTAL_SEQUENCE_DURATION; t += 0.25) {
      const index = activeChapterIndex({ time: t, chapters });
      const chapter = chapters[index];
      const localT = chapterProgress({ time: t, chapter });
      samples.push({
        t: Math.round(t * 100) / 100,
        index,
        phase: cardPhase({ localT, variant: index === 4 ? 'finale' : 'standard' }),
        cameraZ: cinemaCameraZ({
          chapters, activeIndex: index,
          chapterLocal: Math.min(1, Math.max(0, localT)), pullback: 0,
        }),
        green: greenLight({ time: t, heroZ: chapters[4].zPosition }),
        nitrate: openingNitrate(t),
        sway: searchlightSway(t),
        rig: lightRig({ elapsed: t, focusZ: -10 }),
      });
    }
    expect(samples).toMatchSnapshot();
  });
});
