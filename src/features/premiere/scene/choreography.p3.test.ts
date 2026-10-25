// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).

import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, cinemaCameraZ, clamp, GREEN_LIGHT_ACT1_Z, GREEN_LIGHT_HANDOVER_T, greenLight, lightRig, openingNitrate, searchlightSway } from './choreography';

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
});
