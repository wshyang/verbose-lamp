// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).

import { MathUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { activeChapterIndex, cardPhase, cinemaCameraZ, clamp, greenLight, lightRig, searchlightSway, smoothstep } from './choreography';

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
  it('opens the gate of an ordinary card as the camera flies through', () => {
    expect(cardPhase({ localT: 0.79, role: 'standard' }).partOpen).toBe(0);
    expect(cardPhase({ localT: 0.92, role: 'standard' }).partOpen).toBeGreaterThan(0.3);
    expect(cardPhase({ localT: 1.05, role: 'standard' }).partOpen).toBe(1);
  });

  it('fades in from the corridor and out past the lens', () => {
    expect(cardPhase({ localT: -0.1, role: 'standard' }).opacity).toBeLessThan(0.2);
    expect(cardPhase({ localT: 0.5, role: 'standard' }).opacity).toBe(1);
    expect(cardPhase({ localT: 1.05, role: 'standard' }).opacity).toBeLessThan(0.2);
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
  it('sits behind the gate before act V', () => {
    expect(greenLight(20, -108).z).toBe(-7.5);
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
