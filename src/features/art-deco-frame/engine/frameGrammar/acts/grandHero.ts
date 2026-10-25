import { BaseGenome } from '../genome';
import {
  addChevronWings,
  addCutOctagon,
  addDiamond,
  addSplitRule,
  addSunburstFan,
  addZigguratFrame,
} from '../primitives';
import { PolylineSpec } from '../types';

/** The frame's half-extents and the keystone's vertical extent, derived once and shared by the parts. */
interface HeroBox {
  hw: number;
  hh: number;
  keyW: number;
  keyTop: number;
  keyBot: number;
}

function heroBox(mainWidth: number): HeroBox {
  const hw = Math.max(4.45, mainWidth * 0.54 + 0.78);
  const hh = 2.15;
  return { hw, hh, keyW: 0.92, keyTop: hh + 0.74, keyBot: hh - 0.02 };
}

/** The primary four-line concentric stepped plaque around "GREAT / GATSBY". */
function addPlaque(specs: PolylineSpec[], { hw, hh }: HeroBox, genome: BaseGenome): void {
  addZigguratFrame(specs, hw, hh, 0.32, 0.068, 0.13, 0.0, 0.0, genome);
  addZigguratFrame(specs, hw - 0.15, hh - 0.14, 0.28, 0.026, 0.08, 0.05, 0.06, genome);
  addZigguratFrame(specs, hw - 0.27, hh - 0.25, 0.24, 0.022, 0.06, 0.08, 0.11, genome);
  addCutOctagon(specs, hw + 0.36, hh + 0.32, 0.68, 0.036, 0.09, -0.32, 0.14, genome);
  addCutOctagon(specs, hw + 0.78, hh + 0.68, 0.92, 0.026, 0.07, -0.68, 0.2, genome);
}

/** The upper stepped keystone arch housing "THE", with three wing bars flanking it, mirrored. */
function addKeystone(specs: PolylineSpec[], { hw, hh, keyW, keyTop, keyBot }: HeroBox): void {
  for (const s of [-1, 1] as const) {
    specs.push({
      points: [
        { x: 0, y: keyTop },
        { x: s * (keyW - 0.16), y: keyTop },
        { x: s * keyW, y: keyTop - 0.16 },
        { x: s * keyW, y: keyBot },
        { x: 0, y: keyBot },
      ],
      width: 0.044,
      depth: 0.1,
      z: 0.12,
      delay: 0.15,
      kind: 'frame',
      partDir: s,
    });
    for (let b = 0; b < 3; b++) {
      const yBar = hh + 0.52 - b * 0.15;
      const lenBar = hw - 0.45 - b * 0.38;
      specs.push({
        points: [
          { x: s * (keyW + 0.08), y: yBar },
          { x: s * lenBar, y: yBar },
        ],
        width: 0.024,
        depth: 0.06,
        z: 0.08,
        delay: 0.2 + b * 0.04,
        kind: 'rule',
        partDir: s,
      });
    }
  }
}

/** The frieze divider between "GREAT" and "GATSBY", and the lower inner rule above the bottom border. */
function addDividers(specs: PolylineSpec[], { hw }: HeroBox): void {
  addSplitRule(specs, 0.84, 0.24, hw - 0.38, 0.034, 0.08, 0.09, 0.18);
  addSplitRule(specs, 0.73, 0.24, hw - 0.48, 0.02, 0.05, 0.09, 0.22);
  addDiamond(specs, 0, 0.785, 0.22, 0.12, 0.028, 0.08, 0.11, 0.24, 1);

  addSplitRule(specs, -1.52, 0.24, hw - 0.42, 0.028, 0.07, 0.09, 0.2);
  addDiamond(specs, 0, -1.52, 0.22, 0.12, 0.028, 0.08, 0.11, 0.25, -1);
}

/** The flanking multi-plane diamond filigree and chevron lattice wings. */
function addWings(specs: PolylineSpec[], { hw }: HeroBox, genome: BaseGenome): void {
  addChevronWings(specs, hw + 0.22, 4, 0.34, 0.62, 1.55, 0.038, 0.09, -0.18, 0.24, genome);
  for (const s of [-1, 1] as const) {
    addDiamond(specs, s * (hw + 0.55), 0, 0.38, 0.68, 0.032, 0.08, 0.04, 0.28, s);
    addDiamond(specs, s * (hw + 1.45), 0, 0.52, 0.95, 0.028, 0.07, -0.45, 0.32, s);
    specs.push({
      points: [
        { x: s * (hw + 0.92), y: 0 },
        { x: s * (hw + 2.45), y: 0 },
      ],
      width: 0.032,
      depth: 0.07,
      z: -0.25,
      delay: 0.34,
      kind: 'rule',
      partDir: s,
    });
  }
}

/** The grand 15-ray Chrysler sunburst crown over the keystone, and the stepped inverted finial. */
function addCrowns(specs: PolylineSpec[], { hh, keyTop }: HeroBox, genome: BaseGenome): void {
  addSunburstFan(specs, 0, keyTop + 0.04, 0.32, 1.75, 15, Math.PI * 0.84, true, 0.03, 0.08, -0.18, 0.28, genome);
  addSunburstFan(specs, 0, -hh - 0.04, 0.38, 1.45, 11, Math.PI * 0.72, false, 0.028, 0.07, -0.18, 0.3, genome);
}

/**
 * ACT V: the grand hero lockup ("THE GREAT GATSBY"), modelled on the Like Minded Studio and Deva
 * Studios 3D movie-logo lockup. The five parts are built in the order the draw-on reveals them.
 */
export function buildGrandHero(mainWidth: number, genome: BaseGenome): PolylineSpec[] {
  const specs: PolylineSpec[] = [];
  const box = heroBox(mainWidth);
  addPlaque(specs, box, genome);
  addKeystone(specs, box);
  addDividers(specs, box);
  addWings(specs, box, genome);
  addCrowns(specs, box, genome);
  return specs;
}
