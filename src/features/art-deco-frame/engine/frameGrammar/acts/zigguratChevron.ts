import { BaseGenome } from '../genome';
import { addChevronWings, addDiamond, addSplitRule, addZigguratFrame } from '../primitives';
import { PolylineSpec } from '../types';

/** ACT II: stepped skyscraper ziggurat and chevron wings (the cast name). */
export function buildZigguratChevron(mainWidth: number, genome: BaseGenome): PolylineSpec[] {
  const specs: PolylineSpec[] = [];
  const hw = Math.max(4.4, mainWidth * 0.56 + 0.75);
  const hh = 1.68;

  addZigguratFrame(specs, hw, hh, 0.26, 0.06, 0.11, 0.0, 0.0, genome);
  addZigguratFrame(specs, hw - 0.17, hh - 0.15, 0.22, 0.026, 0.07, 0.05, 0.08, genome);
  addZigguratFrame(specs, hw + 0.28, hh + 0.24, 0.3, 0.028, 0.08, -0.32, 0.14, genome);

  // Horizontal double rules framing the main cast name.
  addSplitRule(specs, 0.76, 0.0, hw - 0.45, 0.024, 0.06, 0.06, 0.16);
  addSplitRule(specs, -0.76, 0.0, hw - 0.45, 0.024, 0.06, 0.06, 0.16);

  // Flanking 45-degree Art Deco chevron wings.
  addChevronWings(specs, hw + 0.18, 4, 0.32, 0.55, 1.18, 0.036, 0.08, -0.14, 0.22, genome);

  // Upper and lower diamond clasps.
  addDiamond(specs, 0, hh, 0.28, 0.18, 0.03, 0.08, 0.08, 0.28, 1);
  addDiamond(specs, 0, -hh, 0.28, 0.18, 0.03, 0.08, 0.08, 0.28, -1);
  return specs;
}
