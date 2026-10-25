import { MathUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { stableDigest } from '@/test/digest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  CARD_WINDOW,
  FORCED_NITRATE,
  activeChapterIndex,
  cardPhase,
  cinemaCameraZ,
  clamp,
  greenLight,
  lightRig,
  nitrateLevel,
  openingNitrate,
  rigAnchors,
  searchlightSway,
  smoothstep,
} from './choreography';

const SAMPLE_STEP = 0.25;

function sampleTimes(): number[] {
  const times: number[] = [];
  for (let t = 0; t <= TOTAL_SEQUENCE_DURATION; t += SAMPLE_STEP) times.push(Number(t.toFixed(2)));
  return times;
}

describe('smoothstep', () => {
  it('matches THREE.MathUtils.smoothstep across 50 samples', () => {
    for (let i = 0; i < 50; i += 1) {
      const x = -0.4 + i * 0.05;
      expect(smoothstep(x, -0.04, 0.42)).toBeCloseTo(MathUtils.smoothstep(x, -0.04, 0.42), 12);
      expect(smoothstep(x, 0.8, 1.03)).toBeCloseTo(MathUtils.smoothstep(x, 0.8, 1.03), 12);
    }
  });

  it('clamps outside the interval', () => {
    expect(smoothstep(-5, 0, 1)).toBe(0);
    expect(smoothstep(5, 0, 1)).toBe(1);
    expect(smoothstep(0.5, 0, 1)).toBe(0.5);
  });
});

describe('clamp', () => {
  it('bounds both ends', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });
});

describe('activeChapterIndex', () => {
  it('hands over exactly at each chapter start', () => {
    SEQUENCE_CHAPTERS.forEach((chapter, index) => {
      expect(activeChapterIndex(chapter.startTime, SEQUENCE_CHAPTERS)).toBe(index);
      expect(activeChapterIndex(chapter.endTime, SEQUENCE_CHAPTERS)).toBe(
        Math.min(index + 1, SEQUENCE_CHAPTERS.length - 1)
      );
    });
  });

  it('holds the finale past the end of the sequence', () => {
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION + 5, SEQUENCE_CHAPTERS)).toBe(
      SEQUENCE_CHAPTERS.length - 1
    );
  });
});

describe('cardPhase', () => {
  it('is fully invisible outside the card window', () => {
    expect(cardPhase({ localT: -0.2, isFinale: false })).toEqual({
      drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0,
    });
    expect(cardPhase({ localT: 1.2, isFinale: true }).opacity).toBe(0);
    expect(CARD_WINDOW).toEqual({ before: -0.18, after: 1.18 });
  });

  it('never parts the finale, which holds majestically', () => {
    for (const localT of [-0.1, 0.2, 0.5, 0.9, 1.0, 1.1]) {
      expect(cardPhase({ localT, isFinale: true }).partOpen).toBe(0);
    }
  });

  it('opens the gate of an ordinary card as the camera flies through', () => {
    expect(cardPhase({ localT: 0.79, isFinale: false }).partOpen).toBe(0);
    expect(cardPhase({ localT: 0.92, isFinale: false }).partOpen).toBeGreaterThan(0.3);
    expect(cardPhase({ localT: 1.05, isFinale: false }).partOpen).toBe(1);
  });

  it('draws the frame before the text arrives', () => {
    const early = cardPhase({ localT: 0.2, isFinale: false });
    expect(early.drawProgress).toBeGreaterThan(0.5);
    expect(early.textProgress).toBeGreaterThan(0);
    expect(early.textProgress).toBeLessThan(early.drawProgress);
  });

  it('fades in from the corridor and out past the lens', () => {
    expect(cardPhase({ localT: -0.1, isFinale: false }).opacity).toBeLessThan(0.2);
    expect(cardPhase({ localT: 0.5, isFinale: false }).opacity).toBe(1);
    expect(cardPhase({ localT: 1.05, isFinale: false }).opacity).toBeLessThan(0.2);
  });
});

describe('cinemaCameraZ', () => {
  const pullback = 1.4;
  const input = { chapters: SEQUENCE_CHAPTERS, pullback };

  it('pushes in during the hold, monotonically', () => {
    const early = cinemaCameraZ({ ...input, activeIdx: 1, chapterLocal: 0 });
    const late = cinemaCameraZ({ ...input, activeIdx: 1, chapterLocal: 0.77 });
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThan(SEQUENCE_CHAPTERS[1].zPosition);
  });

  it('flies through to the next chamber in the last fifth', () => {
    const atHold = cinemaCameraZ({ ...input, activeIdx: 1, chapterLocal: 0.78 });
    const atEnd = cinemaCameraZ({ ...input, activeIdx: 1, chapterLocal: 1 });
    expect(atEnd).toBeLessThan(atHold);
    // It must end approaching the next chapter, not the current one.
    expect(atEnd).toBeLessThan(SEQUENCE_CHAPTERS[2].zPosition + 14);
  });

  it('drifts forward through the finale', () => {
    const idx = SEQUENCE_CHAPTERS.length - 1;
    const start = cinemaCameraZ({ ...input, activeIdx: idx, chapterLocal: 0 });
    const end = cinemaCameraZ({ ...input, activeIdx: idx, chapterLocal: 1 });
    expect(end).toBeLessThan(start);
  });
});

describe('greenLight', () => {
  it('is brightest behind the gate in act I, then dark', () => {
    expect(greenLight({ t: 0, heroZ: -108 }).intensity).toBe(1);
    expect(greenLight({ t: 8, heroZ: -108 }).intensity).toBe(0);
  });

  it('returns as a quieter bookend in the finale and moves to the hero chamber', () => {
    const bookend = greenLight({ t: 37.6, heroZ: -108 });
    expect(bookend.intensity).toBeCloseTo(0.65, 6);
    expect(bookend.z).toBe(-115.5);
  });

  it('sits behind the gate before act V', () => {
    expect(greenLight({ t: 20, heroZ: -108 }).z).toBe(-7.5);
  });
});

describe('nitrate', () => {
  it('starts at full opening strength and is gone by 2.55 s', () => {
    expect(openingNitrate(0)).toBe(1);
    expect(nitrateLevel({ t: 0, forced: false })).toBeCloseTo(0.82, 6);
    expect(nitrateLevel({ t: 2.55, forced: false })).toBe(0);
  });

  it('overrides the opening when the user forces the 1920s look', () => {
    expect(nitrateLevel({ t: 20, forced: true })).toBe(FORCED_NITRATE);
    expect(nitrateLevel({ t: 0, forced: true })).toBe(FORCED_NITRATE);
  });
});

describe('searchlightSway and lightRig', () => {
  it('crosses the beams symmetrically-ish and stays bounded', () => {
    for (const elapsed of [0, 1.3, 4.4, 9.9]) {
      const sway = searchlightSway(elapsed);
      expect(Math.abs(sway.left + 0.36)).toBeLessThanOrEqual(0.14);
      expect(Math.abs(sway.right - 0.36)).toBeLessThanOrEqual(0.14);
    }
  });

  it('keeps the cool light overhead and ahead of the focus plane', () => {
    const rig = lightRig(3.2, -20);
    expect(rig.cool).toEqual([0, 4.5, -22]);
    expect(rig.key[2]).toBe(-16.8);
    expect(rig.rim[2]).toBe(-18.5);
  });
});

describe('rigAnchors', () => {
  it('rides behind the camera in cinema mode', () => {
    expect(rigAnchors({ cameraMode: 'cinema', cameraZ: 10, chapterZ: -26 })).toEqual({
      backdropZ: -2,
      lightZ: 3.5,
    });
  });

  it('pins to the inspected chamber in orbit mode', () => {
    expect(rigAnchors({ cameraMode: 'orbit', cameraZ: 10, chapterZ: -26 })).toEqual({
      backdropZ: -29.5,
      lightZ: -22.5,
    });
  });
});

describe('golden choreography', () => {
  it('keeps the whole sequence timing', () => {
    // One sample per 0.25 s over the full 38 s, for every pure function the
    // renderers share. Any timing drift moves this fingerprint.
    const frames = sampleTimes().map((t) => {
      const activeIdx = activeChapterIndex(t, SEQUENCE_CHAPTERS);
      const chapterLocal = clamp(
        (t - SEQUENCE_CHAPTERS[activeIdx].startTime) /
          (SEQUENCE_CHAPTERS[activeIdx].endTime - SEQUENCE_CHAPTERS[activeIdx].startTime),
        0,
        1
      );
      const cameraZ = cinemaCameraZ({
        chapters: SEQUENCE_CHAPTERS,
        activeIdx,
        chapterLocal,
        pullback: 1.4,
      });
      return {
        t,
        activeIdx,
        cards: SEQUENCE_CHAPTERS.map((chapter, i) =>
          cardPhase({
            localT: (t - chapter.startTime) / (chapter.endTime - chapter.startTime),
            isFinale: i === SEQUENCE_CHAPTERS.length - 1,
          })
        ),
        cameraZ,
        green: greenLight({ t, heroZ: SEQUENCE_CHAPTERS[4].zPosition }),
        nitrate: nitrateLevel({ t, forced: false }),
        sway: searchlightSway(t),
        rig: lightRig(t, cameraZ - 6.5),
        anchors: rigAnchors({ cameraMode: 'cinema', cameraZ, chapterZ: SEQUENCE_CHAPTERS[activeIdx].zPosition }),
      };
    });
    expect(stableDigest(frames)).toMatchSnapshot();
  });
});
