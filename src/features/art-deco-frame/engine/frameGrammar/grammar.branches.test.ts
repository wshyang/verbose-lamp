import { describe, expect, it } from 'vitest';
import { clampGene, SIGNATURE_GENOME } from './genome';
import {
  annotateRanks, elaborate, offsetPolylineOutward, reduceByRank,
} from './grammar';
import { clampFormulaLevel } from './styleRules';
import { buildAuthoredFrame } from './index';
import type { PolylineSpec } from './types';

function spec(patch: Partial<PolylineSpec>): PolylineSpec {
  return {
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    width: 0.1, depth: 0.1, z: 0, delay: 0,
    ...patch,
  };
}

describe('grammar defensive branches', () => {
  it('treats a kindless spec as a primary frame in ranks and productions', () => {
    const bare = spec({});
    expect(annotateRanks([bare])[0].rank).toBe(0);
    // echoRing at generation cap 4 for kind 'frame'
    expect(elaborate([bare], 1)).toHaveLength(5);
  });

  it('keeps an unranked spec at the tightest rank budget', () => {
    expect(reduceByRank([spec({})], 0)).toHaveLength(1);
    expect(reduceByRank([spec({ rank: 3 })], 0)).toHaveLength(0);
  });

  it('elaborates degenerate inputs without NaN geometry', () => {
    const emptyDiamond = elaborate([spec({ kind: 'diamond', points: [] })], 1);
    expect(emptyDiamond).toHaveLength(4);
    expect(emptyDiamond.every((s) => s.points.length === 0)).toBe(true);

    const zeroRule = elaborate([spec({
      kind: 'rule', points: [{ x: 1, y: 1 }, { x: 1, y: 1 }],
    })], 1);
    expect(zeroRule.length).toBeGreaterThan(1);
    for (const produced of zeroRule) {
      for (const point of produced.points) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });

  it('defaults a column shadow to the +x side when partDir is absent', () => {
    const out = elaborate([spec({ kind: 'column' })], 1);
    expect(out.length).toBeGreaterThan(1);
    expect(out[1].points[0].x).toBeGreaterThan(out[0].points[0].x);
  });

  it('skips productions whose point count does not fit the rule', () => {
    const chevron = spec({ kind: 'chevron' }); // 2 points; nestedChevron needs 3
    const ray = spec({
      kind: 'ray', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    }); // dashDotTip needs exactly 2
    expect(elaborate([chevron], 1)).toEqual([chevron]);
    expect(elaborate([ray], 1)).toEqual([ray]);
  });

  it('copies short polylines and falls back to the first normal on a reversal', () => {
    const single = [{ x: 1, y: 2 }];
    const copied = offsetPolylineOutward(single, 0.5, false);
    expect(copied).toEqual(single);
    expect(copied[0]).not.toBe(single[0]);
    expect(offsetPolylineOutward([], 0.5, false)).toEqual([]);

    const reversal = offsetPolylineOutward(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }], 0.5, false,
    );
    expect(reversal[1]).toEqual({ x: 1, y: 0.5 });
  });
});

describe('genome/genesis clamps and lattice filtering', () => {
  it('falls back to signature values for non-finite genes and levels', () => {
    expect(clampGene('cornerScale', Number.NaN)).toBe(SIGNATURE_GENOME.cornerScale);
    expect(clampGene('rayReach', Number.POSITIVE_INFINITY)).toBe(SIGNATURE_GENOME.rayReach);
    expect(clampFormulaLevel(Number.NaN)).toBe(2);
    expect(clampFormulaLevel(Number.NEGATIVE_INFINITY)).toBe(2);
  });

  it('builds authored frames with default and explicit intricacy', () => {
    const genome = { ...SIGNATURE_GENOME };
    expect(buildAuthoredFrame('gatsby_hero', 5, genome).length).toBeGreaterThan(0);
    expect(buildAuthoredFrame('gatsby_hero', 5, genome, 0.5).length).toBeGreaterThan(0);
  });
});
