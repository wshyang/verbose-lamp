import { BaseGenome } from '../genome';
import { addCutOctagon, addDiamond, addSplitRule, addZigguratFrame } from '../primitives';
import { PolylineSpec } from '../types';

/** ACT IV: multi-plane stereoscopic rhomboid and fan gateway. */
export function buildDiamondGateway(mainWidth: number, genome: BaseGenome): PolylineSpec[] {
  const specs: PolylineSpec[] = [];
  const hw = Math.max(4.3, mainWidth * 0.56 + 0.8);
  const hh = 1.75;

  // Four concentric z-depth portals make a 3D proscenium tunnel.
  addZigguratFrame(specs, hw + 0.75, hh + 0.65, 0.36, 0.032, 0.08, 0.42, 0.02, genome);
  addCutOctagon(specs, hw, hh, 0.52, 0.064, 0.12, 0.0, 0.08, genome);
  addCutOctagon(specs, hw - 0.18, hh - 0.16, 0.44, 0.026, 0.07, 0.06, 0.14, genome);
  addZigguratFrame(specs, hw + 1.35, hh + 1.05, 0.44, 0.028, 0.07, -0.52, 0.18, genome);

  // Interlocking 45-degree diamond lattice wings, left and right.
  for (const s of [-1, 1] as const) {
    addDiamond(specs, s * (hw + 0.45), 0.52, 0.42, 0.52, 0.028, 0.07, -0.14, 0.22, s);
    addDiamond(specs, s * (hw + 0.45), -0.52, 0.42, 0.52, 0.028, 0.07, -0.14, 0.24, s);
    addDiamond(specs, s * (hw + 0.88), 0.0, 0.46, 0.62, 0.032, 0.08, -0.26, 0.28, s);
  }

  addSplitRule(specs, 0.72, 0.22, hw - 0.42, 0.024, 0.06, 0.06, 0.2);
  addSplitRule(specs, -0.72, 0.22, hw - 0.42, 0.024, 0.06, 0.06, 0.2);
  return specs;
}
