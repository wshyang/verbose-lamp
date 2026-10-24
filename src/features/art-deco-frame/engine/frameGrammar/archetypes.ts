import { FrameArchetype } from '../../model/types';
import { PolylineSpec } from './types';
import { BaseGenome, SIGNATURE_GENOME } from './genome';

import {
  addChevronWings,
  addCutOctagon,
  addDiamond,
  addSplitRule,
  addSunburstFan,
  addZigguratFrame,
} from './primitives';

/* -------------------------------------------------------------------------- */
/*  THE 5 CHOREOGRAPHED GREAT GATSBY GOLDEN FRAME ARCHETYPES                  */
/* -------------------------------------------------------------------------- */

export function buildCoreFrameSpecs(
  archetype: FrameArchetype,
  mainWidth: number,
  genome: BaseGenome = SIGNATURE_GENOME
): PolylineSpec[] {
  const specs: PolylineSpec[] = [];

  if (archetype === 'monogram_gate') {
    // ACT I: Interlocking Tiffany & Co. / Bazmark Octagonal GG Signet Gate
    addCutOctagon(specs, 2.55, 2.95, 0.72, 0.065, 0.11, 0.0, 0.0, genome);
    addCutOctagon(specs, 2.36, 2.76, 0.65, 0.028, 0.07, 0.04, 0.08, genome);
    addCutOctagon(specs, 2.82, 3.22, 0.82, 0.032, 0.08, -0.28, 0.12, genome);

    // 4-line vertical Art Deco side columns
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

    // Interlocking 3D Architectural Geometric 'G' + 'G' Signet Monogram!
    // Left 'G' (shifted left -0.34) & Right 'G' (mirrored/interlocked +0.34)
    specs.push({
      points: [
        { x: 0.34, y: 0.76 },
        { x: 0.12, y: 1.05 },
        { x: -0.62, y: 1.05 },
        { x: -0.92, y: 0.72 },
        { x: -0.92, y: -0.72 },
        { x: -0.62, y: -1.05 },
        { x: 0.12, y: -1.05 },
        { x: 0.38, y: -0.76 },
        { x: 0.38, y: -0.06 },
        { x: -0.26, y: -0.06 },
      ],
      width: 0.075,
      depth: 0.14,
      z: 0.14,
      delay: 0.15,
      kind: 'monogram',
      partDir: -1,
    });
    // Inner pinstripe of Left G
    specs.push({
      points: [
        { x: 0.2, y: 0.68 },
        { x: 0.04, y: 0.89 },
        { x: -0.54, y: 0.89 },
        { x: -0.76, y: 0.64 },
        { x: -0.76, y: -0.64 },
        { x: -0.54, y: -0.89 },
        { x: 0.04, y: -0.89 },
        { x: 0.22, y: -0.68 },
        { x: 0.22, y: -0.2 },
        { x: -0.22, y: -0.2 },
      ],
      width: 0.025,
      depth: 0.1,
      z: 0.18,
      delay: 0.24,
      kind: 'pinstripe',
      partDir: -1,
    });

    // Interlocking Right 'G'
    specs.push({
      points: [
        { x: 0.92, y: 0.72 },
        { x: 0.62, y: 1.05 },
        { x: -0.12, y: 1.05 },
        { x: -0.38, y: 0.76 },
        { x: -0.38, y: -0.76 },
        { x: -0.12, y: -1.05 },
        { x: 0.62, y: -1.05 },
        { x: 0.92, y: -0.72 },
        { x: 0.92, y: 0.08 },
        { x: 0.24, y: 0.08 },
      ],
      width: 0.075,
      depth: 0.14,
      z: 0.09,
      delay: 0.2,
      kind: 'monogram',
      partDir: 1,
    });

    // Corner diamonds + sunburst crown & finial
    addDiamond(specs, -2.55, 0, 0.28, 0.45, 0.032, 0.08, 0.08, 0.28, -1);
    addDiamond(specs, 2.55, 0, 0.28, 0.45, 0.032, 0.08, 0.08, 0.28, 1);
    addSunburstFan(specs, 0, 2.95, 0.35, 1.35, 11, Math.PI * 0.76, true, 0.026, 0.07, -0.12, 0.3, genome);
    addSunburstFan(specs, 0, -2.95, 0.35, 1.15, 9, Math.PI * 0.68, false, 0.024, 0.07, -0.12, 0.32, genome);

    // Top/bottom studio credit wing rules
    addSplitRule(specs, 1.72, 0.15, 2.05, 0.022, 0.05, 0.06, 0.26);
    addSplitRule(specs, -1.72, 0.15, 2.05, 0.022, 0.05, 0.06, 0.26);
  } else if (archetype === 'ziggurat_chevron') {
    // ACT II: Stepped Skyscraper Ziggurat & Chevron Wings (Leonardo DiCaprio)
    const hw = Math.max(4.4, mainWidth * 0.56 + 0.75);
    const hh = 1.68;

    addZigguratFrame(specs, hw, hh, 0.26, 0.06, 0.11, 0.0, 0.0, genome);
    addZigguratFrame(specs, hw - 0.17, hh - 0.15, 0.22, 0.026, 0.07, 0.05, 0.08, genome);
    addZigguratFrame(specs, hw + 0.28, hh + 0.24, 0.3, 0.028, 0.08, -0.32, 0.14, genome);

    // Horizontal double rules framing the main cast name
    addSplitRule(specs, 0.76, 0.0, hw - 0.45, 0.024, 0.06, 0.06, 0.16);
    addSplitRule(specs, -0.76, 0.0, hw - 0.45, 0.024, 0.06, 0.06, 0.16);

    // Flanking 45° Art Deco chevron wings
    addChevronWings(specs, hw + 0.18, 4, 0.32, 0.55, 1.18, 0.036, 0.08, -0.14, 0.22, genome);

    // Upper & lower diamond clasps
    addDiamond(specs, 0, hh, 0.28, 0.18, 0.03, 0.08, 0.08, 0.28, 1);
    addDiamond(specs, 0, -hh, 0.28, 0.18, 0.03, 0.08, 0.08, 0.28, -1);
  } else if (archetype === 'sunburst_octagon') {
    // ACT III: Symmetrical Chrysler Sunburst & Cut-Corner Octagon (Maguire · Mulligan)
    const hw = Math.max(4.5, mainWidth * 0.56 + 0.8);
    const hh = 1.85;

    addCutOctagon(specs, hw, hh, 0.58, 0.062, 0.11, 0.0, 0.0, genome);
    addCutOctagon(specs, hw - 0.16, hh - 0.15, 0.5, 0.026, 0.07, 0.05, 0.07, genome);
    addCutOctagon(specs, hw - 0.3, hh - 0.28, 0.42, 0.02, 0.05, 0.08, 0.13, genome);
    addCutOctagon(specs, hw + 0.32, hh + 0.28, 0.68, 0.028, 0.08, -0.36, 0.16, genome);

    // Majestic 13-ray Chrysler sunburst crown & lower fan
    addSunburstFan(specs, 0, hh, 0.42, 1.65, 13, Math.PI * 0.82, true, 0.03, 0.08, -0.15, 0.22, genome);
    addSunburstFan(specs, 0, -hh, 0.42, 1.35, 11, Math.PI * 0.74, false, 0.026, 0.07, -0.15, 0.25, genome);

    // Side diamond spear extensions
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

    addSplitRule(specs, 0.62, 0.0, hw - 0.55, 0.022, 0.05, 0.06, 0.18);
    addSplitRule(specs, -0.78, 0.0, hw - 0.55, 0.022, 0.05, 0.06, 0.18);
  } else if (archetype === 'diamond_gateway') {
    // ACT IV: Multi-Plane Stereoscopic Rhomboid & Fan Gateway (Baz Luhrmann)
    const hw = Math.max(4.3, mainWidth * 0.56 + 0.8);
    const hh = 1.75;

    // 4 concentric Z-depth portals creating Baz Luhrmann's 3D proscenium tunnel!
    addZigguratFrame(specs, hw + 0.75, hh + 0.65, 0.36, 0.032, 0.08, 0.42, 0.02, genome);
    addCutOctagon(specs, hw, hh, 0.52, 0.064, 0.12, 0.0, 0.08, genome);
    addCutOctagon(specs, hw - 0.18, hh - 0.16, 0.44, 0.026, 0.07, 0.06, 0.14, genome);
    addZigguratFrame(specs, hw + 1.35, hh + 1.05, 0.44, 0.028, 0.07, -0.52, 0.18, genome);

    // Interlocking 45-degree diamond lattice wings left & right
    for (const s of [-1, 1] as const) {
      addDiamond(specs, s * (hw + 0.45), 0.52, 0.42, 0.52, 0.028, 0.07, -0.14, 0.22, s);
      addDiamond(specs, s * (hw + 0.45), -0.52, 0.42, 0.52, 0.028, 0.07, -0.14, 0.24, s);
      addDiamond(specs, s * (hw + 0.88), 0.0, 0.46, 0.62, 0.032, 0.08, -0.26, 0.28, s);
    }

    addSplitRule(specs, 0.72, 0.22, hw - 0.42, 0.024, 0.06, 0.06, 0.2);
    addSplitRule(specs, -0.72, 0.22, hw - 0.42, 0.024, 0.06, 0.06, 0.2);
  } else {
    // ACT V: THE GRAND HERO LOCKUP ("THE GREAT GATSBY")
    // Modeled directly after Like Minded Studio & Deva Studios' iconic 3D movie logo lockup!
    const hw = Math.max(4.45, mainWidth * 0.54 + 0.78);
    const hh = 2.15;

    // 1. Primary 4-Line Concentric Stepped Deco Plaque around "GREAT / GATSBY"
    addZigguratFrame(specs, hw, hh, 0.32, 0.068, 0.13, 0.0, 0.0, genome);
    addZigguratFrame(specs, hw - 0.15, hh - 0.14, 0.28, 0.026, 0.08, 0.05, 0.06, genome);
    addZigguratFrame(specs, hw - 0.27, hh - 0.25, 0.24, 0.022, 0.06, 0.08, 0.11, genome);
    addCutOctagon(specs, hw + 0.36, hh + 0.32, 0.68, 0.036, 0.09, -0.32, 0.14, genome);
    addCutOctagon(specs, hw + 0.78, hh + 0.68, 0.92, 0.026, 0.07, -0.68, 0.2, genome);

    // 2. Dedicated Upper Stepped Keystone Arch housing "THE"
    const keyW = 0.92;
    const keyTop = hh + 0.74;
    const keyBot = hh - 0.02;
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
      // Triple horizontal Art Deco wing bars flanking "THE" keystone
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

    // 3. Horizontal Frieze Divider separating "GREAT" (upper chamber) from monumental "GATSBY"
    addSplitRule(specs, 0.84, 0.24, hw - 0.38, 0.034, 0.08, 0.09, 0.18);
    addSplitRule(specs, 0.73, 0.24, hw - 0.48, 0.02, 0.05, 0.09, 0.22);
    addDiamond(specs, 0, 0.785, 0.22, 0.12, 0.028, 0.08, 0.11, 0.24, 1);

    // Lower inner rule above bottom plaque border
    addSplitRule(specs, -1.52, 0.24, hw - 0.42, 0.028, 0.07, 0.09, 0.2);
    addDiamond(specs, 0, -1.52, 0.22, 0.12, 0.028, 0.08, 0.11, 0.25, -1);

    // 4. Flanking Multi-Plane Diamond Filigree & Chevron Lattice Wings
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

    // 5. Grand 15-Ray Chrysler Sunburst Crown & Stepped Inverted Finial
    addSunburstFan(
      specs,
      0,
      keyTop + 0.04,
      0.32,
      1.75,
      15,
      Math.PI * 0.84,
      true,
      0.03,
      0.08,
      -0.18,
      0.28
    , genome);
    addSunburstFan(
      specs,
      0,
      -hh - 0.04,
      0.38,
      1.45,
      11,
      Math.PI * 0.72,
      false,
      0.028,
      0.07,
      -0.18,
      0.3
    , genome);
  }

  return applyFractalRules(specs, genome);
}

/** Cantor removal: keep the outer thirds, drop the middle, recursing to depth d. */
function cantorSegments(a: number, b: number, depth: number): Array<[number, number]> {
  if (depth <= 0 || b - a < 1e-4) return [[a, b]];
  const third = (b - a) / 3;
  return [...cantorSegments(a, a + third, depth - 1), ...cantorSegments(b - third, b, depth - 1)];
}

/**
 * At d > 0 every split rule becomes a Cantor-dashed run, each level scaled by r.
 * At the signature (d = 0) this is the identity, so the original frame is untouched.
 */
function applyFractalRules(specs: PolylineSpec[], genome: BaseGenome): PolylineSpec[] {
  if (genome.fractalDepth <= 0) return specs;
  return specs.flatMap((spec) => {
    if (spec.kind !== 'rule' || spec.points.length !== 2) return [spec];
    const [a, b] = spec.points;
    return cantorSegments(0, 1, genome.fractalDepth).map(([u, v], index) => ({
      ...spec,
      points: [
        { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
        { x: a.x + (b.x - a.x) * v, y: a.y + (b.y - a.y) * v },
      ],
      width: spec.width * Math.pow(genome.fractalRatio, index === 0 ? 0 : 1),
      delay: spec.delay + index * 0.02,
    }));
  });
}

