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
  FORCED_NITRATE,
  GREEN_LIGHT_ACT1_Z,
  GREEN_LIGHT_HANDOVER_T,
  greenLight,
  lerp,
  lightRig,
  nitrateStrength,
  OPENING_NITRATE_GAIN,
  openingNitrate,
  rigAnchors,
  searchlightSway,
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

// Expected values below come from the shipped manager's inline arithmetic
// (GatsbySceneManager.animate), evaluated with THREE.MathUtils.smoothstep.
describe('greenLight', () => {
  const heroZ = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1].zPosition;

  it.each([
    ['before Act I fades', 0, 1, -7.5],
    ['at the start of the fade', 4.8, 1, -7.5],
    ['half way through the Act I fade', 6.2, 0.4999999999999999, -7.5],
    ['when Act I has fully faded', 7.6, 0, -7.5],
    ['in the dark middle of the film', 9, 0, -7.5],
    ['just before the hand-over', 29.99, 0, -7.5],
    ['exactly at the hand-over time (still Act I’s position)', 30, 0, -7.5],
    ['just after the hand-over, behind the finale card', 30.01, 0, -115.5],
    ['just before the finale bookend begins', 34.8, 0, -115.5],
    ['part-way into the bookend', 36.4, 0.3941690962099122, -115.5],
    ['at the bookend’s full level', 37.6, 0.65, -115.5],
  ])('%s', (_label, t, intensity, z) => {
    const light = greenLight(t, heroZ);

    expect(light.intensity).toBeCloseTo(intensity, 12);
    expect(light.z).toBeCloseTo(z, 12);
  });

  it('exposes the named hand-over constants', () => {
    expect(GREEN_LIGHT_ACT1_Z).toBe(-7.5);
    expect(GREEN_LIGHT_HANDOVER_T).toBe(30);
  });
});

describe('nitrate', () => {
  it.each([
    ['at the very start', 0, 1],
    ['when the fade begins', 0.35, 1],
    ['half way through the fade', 1.45, 0.4999999999999999],
    ['when the fade ends', 2.55, 0],
    ['after the opening', 3, 0],
  ])('the opening projection %s', (_label, t, expected) => {
    expect(openingNitrate(t)).toBeCloseTo(expected, 12);
  });

  it.each([
    ['full opening at t=0', 0, false, 0.82],
    ['still full when the fade begins', 0.35, false, 0.82],
    ['mid-fade', 1.45, false, 0.40999999999999986],
    ['gone after the opening', 2.55, false, 0],
    ['forced on at t=0', 0, true, 0.92],
    ['forced on late in the film', 30, true, 0.92],
  ])('the shader strength is %s', (_label, t, forced, expected) => {
    expect(nitrateStrength(t, forced)).toBeCloseTo(expected, 12);
  });

  it('keeps the gain and forced level as named constants', () => {
    expect(OPENING_NITRATE_GAIN).toBe(0.82);
    expect(FORCED_NITRATE).toBe(0.92);
  });
});

describe('searchlightSway', () => {
  it.each([
    [0, -0.36, 0.5],
    [2, -0.2635509976845228, 0.47059891240963114],
    [10, -0.44566010473198064, 0.22175283221275888],
    [123.4, -0.3278255984618117, 0.22098519536578362],
  ])('at %d s', (elapsed, left, right) => {
    const sway = searchlightSway(elapsed);

    expect(sway.left).toBeCloseTo(left, 12);
    expect(sway.right).toBeCloseTo(right, 12);
  });
});

describe('lightRig', () => {
  it('places the three lights relative to the focus plane at t=0', () => {
    expect(lightRig(0, 10)).toEqual({
      key: [0, 4, 13.2],
      rim: [-6, -2.2, 11.5],
      cool: [0, 4.5, 8],
    });
  });

  it('orbits the key and rim lights while the cool light only follows Z', () => {
    const rig = lightRig(1.7, -20);

    expect(rig.key[0]).toBeCloseTo(5.261136732725422, 12);
    expect(rig.key[1]).toBeCloseTo(3.523976404238975, 12);
    expect(rig.key[2]).toBeCloseTo(-16.8, 12);
    expect(rig.rim[0]).toBeCloseTo(-2.9645843020726934, 12);
    expect(rig.rim[1]).toBeCloseTo(-0.9931013828320465, 12);
    expect(rig.rim[2]).toBeCloseTo(-18.5, 12);
    expect(rig.cool).toEqual([0, 4.5, -22]);
  });

  it('tracks a late finale focus', () => {
    const rig = lightRig(42.5, -95.5);

    expect(rig.key[0]).toBeCloseTo(2.437147304466261, 12);
    expect(rig.rim[1]).toBeCloseTo(-3.673864950761181, 12);
    expect(rig.cool[2]).toBeCloseTo(-97.5, 12);
  });
});

describe('rigAnchors', () => {
  it('hangs the wallpaper and lights off the camera in cinema mode', () => {
    expect(rigAnchors({ cameraMode: 'cinema', cameraZ: 4, chapterZ: -20 })).toEqual({
      backdropZ: -8,
      lightZ: -2.5,
    });
  });

  it('hangs them off the active card in orbit mode, ignoring the camera', () => {
    expect(rigAnchors({ cameraMode: 'orbit', cameraZ: 4, chapterZ: -20 })).toEqual({
      backdropZ: -23.5,
      lightZ: -16.5,
    });
    expect(rigAnchors({ cameraMode: 'orbit', cameraZ: -999, chapterZ: -20 })).toEqual({
      backdropZ: -23.5,
      lightZ: -16.5,
    });
  });
});
