import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  activeChapterIndex,
  cardPhase,
  cinemaCameraZ,
  clamp01,
  FORCED_NITRATE,
  greenLight,
  lightRig,
  openingNitrate,
  rigAnchors,
  searchlightSway,
  smoothstep,
} from './choreography';

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const rounded = (values: readonly number[]) => values.map(round);

describe('smoothstep parity with THREE.MathUtils', () => {
  it('matches across 50 samples and several windows', () => {
    for (const [min, max] of [[-0.04, 0.42], [0.35, 2.55], [4.8, 7.6]] as const) {
      for (let i = 0; i <= 50; i++) {
        const x = min - 0.1 + ((max - min + 0.2) * i) / 50;
        expect(smoothstep(x, min, max)).toBeCloseTo(THREE.MathUtils.smoothstep(x, min, max), 12);
      }
    }
  });
});

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

  it('never parts the finale gate, but fully parts a standard card', () => {
    for (let localT = -0.18; localT <= 1.18; localT += 0.02) {
      expect(cardPhase({ localT, role: 'finale' }).partOpen).toBe(0);
    }
    expect(cardPhase({ localT: 1.1, role: 'standard' }).partOpen).toBe(1);
  });

  it('holds full opacity mid-card and completes draw and text', () => {
    const hold = cardPhase({ localT: 0.6, role: 'standard' });
    expect(hold).toEqual({ drawProgress: 1, textProgress: 1, partOpen: 0, opacity: 1 });
  });
});

describe('nitrate and green light curves', () => {
  it('opens at 0.82 and is gone after 2.55 s; forced mode is 0.92', () => {
    expect(openingNitrate(0)).toBeCloseTo(0.82, 12);
    expect(openingNitrate(2.55)).toBe(0);
    expect(openingNitrate(10)).toBe(0);
    expect(FORCED_NITRATE).toBe(0.92);
  });

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

  it('sway and rig stay bounded around their anchors', () => {
    for (let elapsed = 0; elapsed < 20; elapsed += 0.37) {
      const sway = searchlightSway(elapsed);
      expect(Math.abs(sway.left + 0.36)).toBeLessThanOrEqual(0.14 + 1e-9);
      expect(Math.abs(sway.right - 0.36)).toBeLessThanOrEqual(0.14 + 1e-9);
      const rig = lightRig(elapsed, -40);
      expect(rig.cool).toEqual([0, 4.5, -42]);
      expect(rig.key[2]).toBeCloseTo(-36.8, 9);
    }
    expect(rigAnchors({ cameraMode: 'cinema', cameraZ: 10, chapterZ: -26 }))
      .toEqual({ backdropZ: -2, lightZ: 3.5 });
    expect(rigAnchors({ cameraMode: 'orbit', cameraZ: 10, chapterZ: -26 }))
      .toEqual({ backdropZ: -29.5, lightZ: -22.5 });
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });
});

describe('golden choreography, sampled every 0.25 s', () => {
  it('keeps every function identical across the whole sequence', () => {
    const samples: unknown[] = [];
    for (let t = 0; t <= TOTAL_SEQUENCE_DURATION; t += 0.25) {
      const activeIdx = activeChapterIndex(t, SEQUENCE_CHAPTERS);
      const chapter = SEQUENCE_CHAPTERS[activeIdx];
      const chapterLocal = clamp01((t - chapter.startTime) / (chapter.endTime - chapter.startTime));
      const phase = cardPhase({
        localT: (t - chapter.startTime) / (chapter.endTime - chapter.startTime),
        role: activeIdx === SEQUENCE_CHAPTERS.length - 1 ? 'finale' : 'standard',
      });
      const rig = lightRig(t, -30);
      samples.push({
        t: round(t),
        activeIdx,
        cameraZ: round(cinemaCameraZ({ chapters: SEQUENCE_CHAPTERS, activeIdx, chapterLocal, pullback: 1.2 })),
        phase: {
          drawProgress: round(phase.drawProgress),
          textProgress: round(phase.textProgress),
          partOpen: round(phase.partOpen),
          opacity: round(phase.opacity),
        },
        green: greenLight(t, SEQUENCE_CHAPTERS[4].zPosition).intensity,
        nitrate: round(openingNitrate(t)),
        sway: rounded([searchlightSway(t).left, searchlightSway(t).right]),
        key: rounded(rig.key),
        anchors: rigAnchors({ cameraMode: 'cinema', cameraZ: 8, chapterZ: chapter.zPosition }),
      });
    }
    expect(samples).toMatchSnapshot();
  });
});
