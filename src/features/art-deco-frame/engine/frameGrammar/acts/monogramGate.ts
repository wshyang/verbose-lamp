import { BaseGenome } from '../genome';
import { addCutOctagon, addDiamond, addSplitRule, addSunburstFan } from '../primitives';
import { PolylineSpec } from '../types';

type Point = { x: number; y: number };

/** One of the two interlocking G letterforms, drawn as an outer stroke or its inner pinstripe. */
interface Letter {
  points: Point[];
  width: number;
  depth: number;
  z: number;
  delay: number;
  kind: 'monogram' | 'pinstripe';
  partDir: -1 | 1;
}

/** Left 'G' shifted left, right 'G' mirrored and interlocked, plus the left 'G''s inner pinstripe. */
const LETTERS: readonly Letter[] = [
  {
    points: [
      { x: 0.34, y: 0.76 }, { x: 0.12, y: 1.05 }, { x: -0.62, y: 1.05 }, { x: -0.92, y: 0.72 },
      { x: -0.92, y: -0.72 }, { x: -0.62, y: -1.05 }, { x: 0.12, y: -1.05 }, { x: 0.38, y: -0.76 },
      { x: 0.38, y: -0.06 }, { x: -0.26, y: -0.06 },
    ],
    width: 0.075, depth: 0.14, z: 0.14, delay: 0.15, kind: 'monogram', partDir: -1,
  },
  {
    points: [
      { x: 0.2, y: 0.68 }, { x: 0.04, y: 0.89 }, { x: -0.54, y: 0.89 }, { x: -0.76, y: 0.64 },
      { x: -0.76, y: -0.64 }, { x: -0.54, y: -0.89 }, { x: 0.04, y: -0.89 }, { x: 0.22, y: -0.68 },
      { x: 0.22, y: -0.2 }, { x: -0.22, y: -0.2 },
    ],
    width: 0.025, depth: 0.1, z: 0.18, delay: 0.24, kind: 'pinstripe', partDir: -1,
  },
  {
    points: [
      { x: 0.92, y: 0.72 }, { x: 0.62, y: 1.05 }, { x: -0.12, y: 1.05 }, { x: -0.38, y: 0.76 },
      { x: -0.38, y: -0.76 }, { x: -0.12, y: -1.05 }, { x: 0.62, y: -1.05 }, { x: 0.92, y: -0.72 },
      { x: 0.92, y: 0.08 }, { x: 0.24, y: 0.08 },
    ],
    width: 0.075, depth: 0.14, z: 0.09, delay: 0.2, kind: 'monogram', partDir: 1,
  },
];

/** Three nested cut-corner octagons: the signet's gate. */
function addGate(specs: PolylineSpec[], genome: BaseGenome): void {
  addCutOctagon(specs, 2.55, 2.95, 0.72, 0.065, 0.11, 0.0, 0.0, genome);
  addCutOctagon(specs, 2.36, 2.76, 0.65, 0.028, 0.07, 0.04, 0.08, genome);
  addCutOctagon(specs, 2.82, 3.22, 0.82, 0.032, 0.08, -0.28, 0.12, genome);
}

/** Three 4-line vertical Art Deco columns either side, stepping inward. */
function addSideColumns(specs: PolylineSpec[]): void {
  for (let i = 0; i < 3; i++) {
    const xOff = 3.15 + i * 0.14;
    for (const s of [-1, 1] as const) {
      specs.push({
        points: [
          { x: s * xOff, y: 2.3 - i * 0.25 },
          { x: s * xOff, y: -2.3 + i * 0.25 },
        ],
        width: 0.024,
        depth: 0.06,
        z: -0.18 - i * 0.12,
        delay: 0.18 + i * 0.05,
        kind: 'column',
        partDir: s,
      });
    }
  }
}

/** Corner diamonds, the sunburst crown and finial, and the top and bottom studio credit rules. */
function addCrownAndRules(specs: PolylineSpec[], genome: BaseGenome): void {
  addDiamond(specs, -2.55, 0, 0.28, 0.45, 0.032, 0.08, 0.08, 0.28, -1);
  addDiamond(specs, 2.55, 0, 0.28, 0.45, 0.032, 0.08, 0.08, 0.28, 1);
  addSunburstFan(specs, 0, 2.95, 0.35, 1.35, 11, Math.PI * 0.76, true, 0.026, 0.07, -0.12, 0.3, genome);
  addSunburstFan(specs, 0, -2.95, 0.35, 1.15, 9, Math.PI * 0.68, false, 0.024, 0.07, -0.12, 0.32, genome);
  addSplitRule(specs, 1.72, 0.15, 2.05, 0.022, 0.05, 0.06, 0.26);
  addSplitRule(specs, -1.72, 0.15, 2.05, 0.022, 0.05, 0.06, 0.26);
}

/** ACT I: the interlocking Tiffany & Co. / Bazmark octagonal GG signet gate. */
export function buildMonogramGate(genome: BaseGenome): PolylineSpec[] {
  const specs: PolylineSpec[] = [];
  addGate(specs, genome);
  addSideColumns(specs);
  for (const letter of LETTERS) specs.push({ ...letter, points: letter.points.map((p) => ({ ...p })) });
  addCrownAndRules(specs, genome);
  return specs;
}
