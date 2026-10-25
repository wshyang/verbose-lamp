import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  CARD_WINDOW,
  FORCED_NITRATE,
  GREEN_LIGHT_ACT1_Z,
  GREEN_LIGHT_HANDOVER_T,
  OPENING_NITRATE_GAIN,
  activeChapterIndex,
  cardPhase,
  cinemaCameraZ,
  clamp,
  greenLight,
  lerp,
  lightRig,
  nitrateStrength,
  openingNitrate,
  rigAnchors,
  searchlightSway,
  smoothstep,
} from './choreography';

const round = (value: number) => Number(value.toFixed(6));

describe('choreography primitives', () => {
  it('matches three’s smoothstep across the curve', () => {
    for (let i = 0; i <= 50; i += 1) {
      const x = -0.5 + i * 0.05;
      expect(smoothstep(x, 0.35, 2.55)).toBeCloseTo(THREE.MathUtils.smoothstep(x, 0.35, 2.55), 12);
      expect(smoothstep(x, -0.04, 0.42)).toBeCloseTo(THREE.MathUtils.smoothstep(x, -0.04, 0.42), 12);
    }
  });

  it('clamps and saturates smoothstep at its edges', () => {
    expect(smoothstep(0.3, 0.35, 2.55)).toBe(0);
    expect(smoothstep(2.6, 0.35, 2.55)).toBe(1);
    expect(smoothstep(0.35, 0.35, 2.55)).toBe(0);
    expect(smoothstep(2.55, 0.35, 2.55)).toBe(1);
  });

  it('mirrors clamp and lerp', () => {
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(7, 0, 1)).toBe(1);
    expect(clamp(0.25, 0, 1)).toBe(0.25);
    expect(lerp(4, 8, 0)).toBe(4);
    expect(lerp(4, 8, 1)).toBe(8);
    expect(lerp(4, 8, 0.5)).toBe(6);
  });
});

describe('activeChapterIndex', () => {
  it('finds the chapter that owns the time', () => {
    expect(activeChapterIndex(0, SEQUENCE_CHAPTERS)).toBe(0);
    expect(activeChapterIndex(4.32, SEQUENCE_CHAPTERS)).toBe(0);
    expect(activeChapterIndex(11.28, SEQUENCE_CHAPTERS)).toBe(1);
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION - 0.001, SEQUENCE_CHAPTERS)).toBe(4);
  });

  it('reads anything off the sequence as the finale', () => {
    expect(activeChapterIndex(-3, SEQUENCE_CHAPTERS)).toBe(4);
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION, SEQUENCE_CHAPTERS)).toBe(4);
    expect(activeChapterIndex(Number.NaN, SEQUENCE_CHAPTERS)).toBe(4);
    expect(activeChapterIndex(1, [])).toBe(-1);
  });
});

describe('cardPhase', () => {
  it('stays dark outside the staging window', () => {
    expect(cardPhase(-CARD_WINDOW - 0.01, false)).toEqual({
      drawProgress: 0,
      textProgress: 0,
      partOpen: 0,
      opacity: 0,
    });
    expect(cardPhase(1 + CARD_WINDOW + 0.01, true).opacity).toBe(0);
  });

  it('draws on, wipes the title in and fades out within the window', () => {
    const early = cardPhase(0, false);
    expect(early.drawProgress).toBeCloseTo(0.0214, 3);
    expect(early.textProgress).toBe(0);
    expect(early.opacity).toBeCloseTo(0.886, 3);
    expect(early.partOpen).toBe(0);

    const late = cardPhase(0.9, false);
    expect(late.drawProgress).toBe(1);
    expect(late.textProgress).toBe(1);
    expect(late.partOpen).toBeCloseTo(0.403, 3);
    expect(late.opacity).toBe(1);
  });

  it('keeps the finale gate shut and fades it a touch later', () => {
    expect(cardPhase(0.95, true).partOpen).toBe(0);
    expect(cardPhase(0.95, true).opacity).toBeCloseTo(0.544, 3);
    expect(cardPhase(0.95, false).opacity).toBeCloseTo(0.985, 3);
  });
});

describe('cinemaCameraZ', () => {
  const solve = (t: number, pullback = 0) => {
    const activeIdx = activeChapterIndex(t, SEQUENCE_CHAPTERS);
    const chapter = SEQUENCE_CHAPTERS[activeIdx];
    const chapterLocal = clamp(
      (t - chapter.startTime) / (chapter.endTime - chapter.startTime),
      0,
      1,
    );
    return cinemaCameraZ({ chapters: SEQUENCE_CHAPTERS, activeIdx, chapterLocal, pullback });
  };

  it('pushes in across each hold', () => {
    const chapter = SEQUENCE_CHAPTERS[0];
    expect(solve(chapter.startTime)).toBeCloseTo(chapter.zPosition + 12.2, 6);
    const mid = solve(chapter.startTime + (chapter.endTime - chapter.startTime) * 0.78);
    expect(mid).toBeCloseTo(chapter.zPosition + 9.0, 6);
  });

  it('flies through into the next chamber', () => {
    const chapter = SEQUENCE_CHAPTERS[0];
    const next = SEQUENCE_CHAPTERS[1];
    // The fly-through lands on the next chamber's opening framing, one corridor further in.
    const handoff = solve(chapter.startTime + (chapter.endTime - chapter.startTime) * 0.999);
    expect(handoff).toBeCloseTo(next.zPosition + 12.2, 1);
    expect(handoff).toBeLessThan(chapter.zPosition + 9.0);
    expect(next.zPosition).toBeLessThan(chapter.zPosition);
  });

  it('frames the finale crown and then drifts in', () => {
    const finale = SEQUENCE_CHAPTERS[4];
    const opening = solve(finale.startTime);
    const hold = solve(finale.startTime + (finale.endTime - finale.startTime) * 0.52);
    expect(opening).toBeCloseTo(finale.zPosition + 15.2, 6);
    expect(hold).toBeLessThan(opening);
    expect(solve(finale.endTime - 0.001)).toBeLessThan(hold);
  });

  it('pulls back further on narrow viewports', () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    expect(solve(chapter.startTime, 2.4)).toBeCloseTo(chapter.zPosition + 14.6, 6);
    expect(solve(chapter.startTime, 2.4)).toBeGreaterThan(solve(chapter.startTime, 0));
  });
});

describe('greenLight', () => {
  const heroZ = SEQUENCE_CHAPTERS[4].zPosition;

  it('burns behind the Act I gate, then hands over to the finale bookend', () => {
    expect(greenLight(0, heroZ)).toEqual({ intensity: 1, z: GREEN_LIGHT_ACT1_Z });
    expect(greenLight(6.2, heroZ).intensity).toBeCloseTo(0.5, 2);
    expect(greenLight(9, heroZ).intensity).toBe(0);
    expect(greenLight(36.4, heroZ).intensity).toBeCloseTo(0.394, 3);
    expect(greenLight(36.4, heroZ).z).toBeCloseTo(heroZ - 7.5, 6);
    expect(greenLight(GREEN_LIGHT_HANDOVER_T, heroZ).z).toBe(GREEN_LIGHT_ACT1_Z);
    expect(greenLight(GREEN_LIGHT_HANDOVER_T + 0.01, heroZ).z).toBeCloseTo(heroZ - 7.5, 6);
  });
});

describe('nitrate', () => {
  it('fades the opening projection out by 2.55 s', () => {
    expect(openingNitrate(0)).toBe(1);
    expect(openingNitrate(1.45)).toBeCloseTo(0.5, 2);
    expect(openingNitrate(3)).toBe(0);
  });

  it('applies the shader gain or the forced look', () => {
    expect(nitrateStrength(0, false)).toBe(OPENING_NITRATE_GAIN);
    expect(nitrateStrength(3, false)).toBe(0);
    expect(nitrateStrength(30, true)).toBe(FORCED_NITRATE);
    expect(FORCED_NITRATE).toBe(0.92);
  });
});

describe('moving rigs', () => {
  it('sways the searchlights in counter-phase', () => {
    const start = searchlightSway(0);
    expect(start.left).toBeCloseTo(-0.36, 6);
    expect(start.right).toBeCloseTo(0.5, 6);
    expect(searchlightSway(2).left).toBeGreaterThan(start.left);
    expect(searchlightSway(2).left).toBeLessThan(0);
    expect(searchlightSway(2).right).toBeLessThan(start.right);
  });

  it('orbits the three point lights around the focus plane', () => {
    const rig = lightRig(0, 10);
    expect(rig.key).toEqual([0, 4, 13.2]);
    expect(rig.rim).toEqual([-6, -2.2, 11.5]);
    expect(rig.cool).toEqual([0, 4.5, 8]);
    const later = lightRig(Math.PI / (2 * 0.62), 10);
    expect(later.key[0]).toBeGreaterThan(rig.key[0]);
    expect(later.rim[0]).toBeCloseTo(0, 6);
    expect(later.cool[0]).toBe(0);
  });

  it('hangs the backdrop and rig off the camera or the card', () => {
    expect(rigAnchors({ cameraMode: 'cinema', cameraZ: 4, chapterZ: -20 })).toEqual({
      backdropZ: -8,
      lightZ: -2.5,
    });
    expect(rigAnchors({ cameraMode: 'orbit', cameraZ: 4, chapterZ: -20 })).toEqual({
      backdropZ: -23.5,
      lightZ: -16.5,
    });
  });
});

describe('golden sequence', () => {
  it('stages the same frame at every quarter second of the premiere', () => {
    const samples: string[] = [];
    for (let step = 0; step * 0.25 <= TOTAL_SEQUENCE_DURATION; step += 1) {
      const t = round(Math.min(step * 0.25, TOTAL_SEQUENCE_DURATION - 0.001));
      const activeIdx = activeChapterIndex(t, SEQUENCE_CHAPTERS);
      const chapter = SEQUENCE_CHAPTERS[activeIdx];
      const chapterLocal = clamp(
        (t - chapter.startTime) / (chapter.endTime - chapter.startTime),
        0,
        1,
      );
      const phase = cardPhase((t - chapter.startTime) / (chapter.endTime - chapter.startTime), activeIdx === 4);
      const cameraZ = cinemaCameraZ({ chapters: SEQUENCE_CHAPTERS, activeIdx, chapterLocal, pullback: 0 });
      const glow = greenLight(t, SEQUENCE_CHAPTERS[4].zPosition);
      const sway = searchlightSway(t);
      samples.push(
        [
          t.toFixed(2),
          activeIdx,
          round(cameraZ).toFixed(4),
          round(phase.drawProgress).toFixed(4),
          round(phase.textProgress).toFixed(4),
          round(phase.partOpen).toFixed(4),
          round(phase.opacity).toFixed(4),
          round(glow.intensity).toFixed(4),
          round(glow.z).toFixed(2),
          round(sway.left).toFixed(4),
          round(sway.right).toFixed(4),
          round(nitrateStrength(t, false)).toFixed(4),
        ].join(' '),
      );
    }
    expect(samples).toMatchSnapshot();
  });
});
