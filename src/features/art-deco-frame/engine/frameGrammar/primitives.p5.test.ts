// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { SIGNATURE_GENOME, withGene } from './genome';

import { addDiamond, addSunburstFan, addCutOctagon } from './primitives';

import { type PolylineSpec } from './types';

const collect = (): PolylineSpec[] => [];
describe('addCutOctagon corner profiles', () => {
  it('keeps the plate envelope while rounding, notching or chamfering corners', () => {
    const rounded = collect();
    addCutOctagon(rounded, 2, 3, 0.5, 0.03, 0.08, 0, 0.1, withGene(SIGNATURE_GENOME, 'cornerProfile', 1));
    expect(rounded.map((spec) => spec.points.length)).toEqual([7, 7]);

    const notched = collect();
    addCutOctagon(notched, 2, 3, 0.5, 0.03, 0.08, 0, 0.1, withGene(SIGNATURE_GENOME, 'cornerProfile', -1));
    expect(notched.map((spec) => spec.points.length)).toEqual([10, 10]);

    const straight = collect();
    addCutOctagon(straight, 2, 3, 0.5, 0.03, 0.08, 0, 0.1, withGene(SIGNATURE_GENOME, 'cornerProfile', 0));
    expect(straight.map((spec) => spec.points.length)).toEqual([6, 6]);

    for (const specs of [rounded, notched, straight]) {
      for (const spec of specs) {
        expect(Math.max(...spec.points.map((point) => Math.abs(point.x)))).toBeCloseTo(2, 10);
        expect(Math.max(...spec.points.map((point) => Math.abs(point.y)))).toBeCloseTo(3, 10);
      }
    }
  });
});
describe('addDiamond parting direction', () => {
  it('infers direction from the centre unless the caller overrides it', () => {
    const specs = collect();
    addDiamond(specs, -2, 0, 0.3, 0.5, 0.03, 0.08, 0, 0.1);
    addDiamond(specs, 0, 0, 0.3, 0.5, 0.03, 0.08, 0, 0.1);
    addDiamond(specs, -2, 1, 0.3, 0.5, 0.03, 0.08, 0, 0.1, 1);
    expect(specs.map((spec) => spec.partDir)).toEqual([-1, 1, 1]);
  });
});
describe('addSunburstFan', () => {
  it('collapses to a single centre ray when only one ray survives', () => {
    const specs = collect();
    addSunburstFan(specs, 0, 0, 0.2, 1, 1, Math.PI / 2, true, 0.03, 0.08, 0, 0.1);
    const rays = specs.filter((spec) => spec.kind === 'ray');
    expect(rays).toHaveLength(1);
    expect(specs[0].points[0].x).toBeCloseTo(0, 10);
    expect(specs[0].points[1].x).toBeCloseTo(0, 10);
    expect(specs[0].points[1].y).toBeGreaterThan(specs[0].points[0].y);
  });
});
