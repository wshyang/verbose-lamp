import { BaseGenome } from '../genome';
import { addCutOctagon, addDiamond, addSplitRule, addSunburstFan } from '../primitives';
import { PolylineSpec } from '../types';

/** The side spears: a diamond with a long rule running out from the frame, mirrored left and right. */
function addSideSpears(specs: PolylineSpec[], hw: number): void {
  for (const s of [-1, 1] as const) {
    addDiamond(specs, s * (hw + 0.48), 0, 0.45, 0.3, 0.034, 0.08, 0.02, 0.24, s);
    specs.push({
      points: [
        { x: s * hw, y: 0 },
        { x: s * (hw + 1.55), y: 0 },
      ],
      width: 0.032,
      depth: 0.07,
      z: 0.02,
      delay: 0.28,
      kind: 'rule',
      partDir: s,
    });
  }
}

/** ACT III: symmetrical Chrysler sunburst and cut-corner octagon (the supporting cast). */
export function buildSunburstOctagon(mainWidth: number, genome: BaseGenome): PolylineSpec[] {
  const specs: PolylineSpec[] = [];
  const hw = Math.max(4.5, mainWidth * 0.56 + 0.8);
  const hh = 1.85;

  addCutOctagon(specs, hw, hh, 0.58, 0.062, 0.11, 0.0, 0.0, genome);
  addCutOctagon(specs, hw - 0.16, hh - 0.15, 0.5, 0.026, 0.07, 0.05, 0.07, genome);
  addCutOctagon(specs, hw - 0.3, hh - 0.28, 0.42, 0.02, 0.05, 0.08, 0.13, genome);
  addCutOctagon(specs, hw + 0.32, hh + 0.28, 0.68, 0.028, 0.08, -0.36, 0.16, genome);

  // Majestic 13-ray Chrysler sunburst crown and lower fan.
  addSunburstFan(specs, 0, hh, 0.42, 1.65, 13, Math.PI * 0.82, true, 0.03, 0.08, -0.15, 0.22, genome);
  addSunburstFan(specs, 0, -hh, 0.42, 1.35, 11, Math.PI * 0.74, false, 0.026, 0.07, -0.15, 0.25, genome);

  addSideSpears(specs, hw);
  addSplitRule(specs, 0.62, 0.0, hw - 0.55, 0.022, 0.05, 0.06, 0.18);
  addSplitRule(specs, -0.78, 0.0, hw - 0.55, 0.022, 0.05, 0.06, 0.18);
  return specs;
}
