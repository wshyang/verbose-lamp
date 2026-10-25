import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  CARD_WINDOW,
  activeChapterIndex,
  cardPhase,
  cardRole,
  cinemaCameraZ,
  clamp,
  lerp,
  smoothstep,
} from './choreography';

describe('choreography primitives', () => {
  it('matches three’s smoothstep across the curve', () => {
    for (let i = 0; i <= 50; i += 1) {
      const x = -0.5 + i * 0.05;
      expect(smoothstep(x, 0.35, 2.55)).toBeCloseTo(THREE.MathUtils.smoothstep(x, 0.35, 2.55), 12);
      expect(smoothstep(x, -0.04, 0.42)).toBeCloseTo(THREE.MathUtils.smoothstep(x, -0.04, 0.42), 12);
    }
  });

  it('saturates smoothstep at and beyond its edges', () => {
    expect(smoothstep(0.3, 0.35, 2.55)).toBe(0);
    expect(smoothstep(2.6, 0.35, 2.55)).toBe(1);
    expect(smoothstep(0.35, 0.35, 2.55)).toBe(0);
    expect(smoothstep(2.55, 0.35, 2.55)).toBe(1);
  });

  it('clamps into the closed range', () => {
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(7, 0, 1)).toBe(1);
    expect(clamp(0.25, 0, 1)).toBe(0.25);
  });

  it('interpolates linearly between its ends', () => {
    expect(lerp(4, 8, 0)).toBe(4);
    expect(lerp(4, 8, 1)).toBe(8);
    expect(lerp(4, 8, 0.5)).toBe(6);
  });

  // `a + (b - a) * t` differs from three's `(1 - t) * a + t * b` in the last bit on about
  // a quarter of random inputs. The camera Z is lerped every frame, so the form is pinned
  // to the one the shipped manager used.
  it('is bit-identical to three’s lerp, which the shipped manager used', () => {
    for (let i = 0; i < 2000; i += 1) {
      const from = -52 + ((i * 37) % 60) + (i % 7) * 0.137;
      const to = from + ((i % 13) - 6.5) * 1.1;
      const t = (i % 101) / 100;
      expect(lerp(from, to, t)).toBe(THREE.MathUtils.lerp(from, to, t));
    }
  });
});

describe('activeChapterIndex', () => {
  it('finds the chapter that owns the time', () => {
    expect(activeChapterIndex(0, SEQUENCE_CHAPTERS)).toBe(0);
    expect(activeChapterIndex(4.32, SEQUENCE_CHAPTERS)).toBe(0);
    expect(activeChapterIndex(11.28, SEQUENCE_CHAPTERS)).toBe(1);
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION - 0.001, SEQUENCE_CHAPTERS)).toBe(4);
  });

  it('hands a chapter boundary to the later chapter (end is exclusive)', () => {
    for (let index = 1; index < SEQUENCE_CHAPTERS.length; index += 1) {
      expect(activeChapterIndex(SEQUENCE_CHAPTERS[index].startTime, SEQUENCE_CHAPTERS)).toBe(index);
    }
  });

  it('reads anything off the sequence as the finale', () => {
    expect(activeChapterIndex(-3, SEQUENCE_CHAPTERS)).toBe(4);
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION, SEQUENCE_CHAPTERS)).toBe(4);
    expect(activeChapterIndex(Number.NaN, SEQUENCE_CHAPTERS)).toBe(4);
  });

  it('returns -1 for an empty chapter list', () => {
    expect(activeChapterIndex(1, [])).toBe(-1);
  });
});

const OFF_STAGE = { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };

describe('cardRole', () => {
  it('makes only the last chapter the finale', () => {
    expect(cardRole(0, 5)).toBe('standard');
    expect(cardRole(3, 5)).toBe('standard');
    expect(cardRole(4, 5)).toBe('finale');
  });

  it('treats a lone chapter as the finale', () => {
    expect(cardRole(0, 1)).toBe('finale');
  });
});

// Expected values were computed from the shipped manager's inline arithmetic
// (GatsbySceneManager.animate, `THREE.MathUtils.smoothstep`), not from this module.
describe('cardPhase', () => {
  it('stays dark outside the staging window, whatever the role', () => {
    expect(cardPhase({ localT: -CARD_WINDOW - 0.01, role: 'standard' })).toEqual(OFF_STAGE);
    expect(cardPhase({ localT: 1 + CARD_WINDOW + 0.01, role: 'finale' })).toEqual(OFF_STAGE);
  });

  it('is still staged exactly on the window edges', () => {
    expect(cardPhase({ localT: -CARD_WINDOW, role: 'standard' })).toEqual(OFF_STAGE);
    expect(cardPhase({ localT: 1 + CARD_WINDOW, role: 'finale' }).opacity).toBe(0);
    expect(cardPhase({ localT: 1 + CARD_WINDOW, role: 'finale' }).drawProgress).toBe(1);
  });

  it('draws on and fades in at the card’s first instant', () => {
    const phase = cardPhase({ localT: 0, role: 'standard' });

    expect(phase.drawProgress).toBeCloseTo(0.021369277554, 10);
    expect(phase.textProgress).toBe(0);
    expect(phase.partOpen).toBe(0);
    expect(phase.opacity).toBeCloseTo(0.885697623560, 10);
  });

  it('is fully drawn and legible mid-card, with the gate shut', () => {
    expect(cardPhase({ localT: 0.5, role: 'standard' })).toEqual({
      drawProgress: 1,
      textProgress: 1,
      partOpen: 0,
      opacity: 1,
    });
  });

  it('parts the gate as the camera flies through a standard card', () => {
    const phase = cardPhase({ localT: 0.9, role: 'standard' });

    expect(phase.partOpen).toBeCloseTo(0.402728692364, 10);
    expect(phase.opacity).toBe(1);
    expect(cardPhase({ localT: 0.95, role: 'standard' }).partOpen).toBeCloseTo(0.721213117449, 10);
  });

  it('keeps the finale gate shut and fades it out earlier than a standard card', () => {
    const finale = cardPhase({ localT: 0.95, role: 'finale' });
    const standard = cardPhase({ localT: 0.95, role: 'standard' });

    expect(finale.partOpen).toBe(0);
    expect(finale.opacity).toBeCloseTo(0.544066761653, 10);
    expect(standard.opacity).toBeCloseTo(0.985422740525, 10);
    expect(finale.opacity).toBeLessThan(standard.opacity);
  });

  it('has fully faded the finale by the end of its own time', () => {
    expect(cardPhase({ localT: 1, role: 'finale' }).opacity).toBe(0);
  });

  it('never leaves 0..1 for any progress value across the whole window', () => {
    for (let step = -20; step <= 120; step += 1) {
      for (const role of ['standard', 'finale'] as const) {
        const phase = cardPhase({ localT: step / 100, role });
        for (const value of Object.values(phase)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

// Expected Z values were computed from the shipped manager's inline camera code
// (GatsbySceneManager.animate, the cinema branch) over the real SEQUENCE_CHAPTERS.
describe('cinemaCameraZ', () => {
  const solve = (t: number, pullback: number): number => {
    const activeIdx = activeChapterIndex(t, SEQUENCE_CHAPTERS);
    const chapter = SEQUENCE_CHAPTERS[activeIdx];
    const chapterLocal = clamp((t - chapter.startTime) / (chapter.endTime - chapter.startTime), 0, 1);
    return cinemaCameraZ({ chapters: SEQUENCE_CHAPTERS, activeIdx, chapterLocal, pullback });
  };

  it.each([
    ['the very first frame', 0, 0, 12.2],
    ['a quarter of the way into the first hold', 3, 0, 10.49059829059829],
    ['the end of the first hold (0.78)', 5.616, 0, 9],
    ['the middle of the first fly-through', 6.5, 0, -4.377429289837461],
    ['the last instant of the first chapter', 7.1999, 0, -13.799999727398983],
    ['a narrow viewport pulls back from chapter two’s start', 7.2, 2.4, -11.4],
    ['inside the second hold', 12, 0, -16.695927601809956],
    ['a mid pull-back in the second fly-through', 13.5, 1.2, -32.70865704887889],
    ['inside the third hold', 19, 0, -42.81659125188537],
    ['the fly-through into the chapter before the finale', 20.7, 0, -65.50799193724372],
    ['the fourth chapter, flying toward the finale', 27.4, 0, -92.48623627271357],
    ['the finale’s first frame', 27.5, 0, -92.8],
    ['the finale’s first frame on a narrow viewport', 27.5, 2.4, -90.4],
    ['the finale’s ease toward its hold', 30, 0, -95.17266480201275],
    ['the finale mid-way on a narrow viewport', 33, 2.4, -93.59285714285714],
    ['the last instant before the end', 37.999, 0, -96.34992857142856],
  ])('%s', (_label, t, pullback, expected) => {
    expect(solve(t, pullback)).toBeCloseTo(expected, 9);
  });

  it('lands the fly-through on the next chapter’s opening framing, without a jump', () => {
    for (let index = 0; index < SEQUENCE_CHAPTERS.length - 1; index += 1) {
      const next = SEQUENCE_CHAPTERS[index + 1];
      const justBefore = solve(next.startTime - 1e-6, 0);
      const opening = solve(next.startTime, 0);

      expect(Math.abs(opening - justBefore)).toBeLessThan(1e-3);
    }
  });

  it('pulls back further on narrow viewports in every chapter', () => {
    for (const chapter of SEQUENCE_CHAPTERS) {
      expect(solve(chapter.startTime, 2.4)).toBeGreaterThan(solve(chapter.startTime, 0));
    }
  });

  it('only ever moves forward along the corridor (Z never increases)', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 3800; step += 1) {
      const z = solve(step / 100, 0);
      expect(z).toBeLessThanOrEqual(previous + 1e-9);
      previous = z;
    }
  });
});
