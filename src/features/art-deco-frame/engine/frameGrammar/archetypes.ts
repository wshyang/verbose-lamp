import { FrameArchetype } from '../../model/types';
import { PolylineSpec } from './types';
import { BaseGenome, SIGNATURE_GENOME } from './genome';

import { buildDiamondGateway } from './acts/diamondGateway';
import { buildGrandHero } from './acts/grandHero';
import { buildMonogramGate } from './acts/monogramGate';
import { buildSunburstOctagon } from './acts/sunburstOctagon';
import { buildZigguratChevron } from './acts/zigguratChevron';

/* -------------------------------------------------------------------------- */
/*  THE 5 CHOREOGRAPHED GREAT GATSBY GOLDEN FRAME ARCHETYPES                  */
/* -------------------------------------------------------------------------- */

export function buildCoreFrameSpecs(
  archetype: FrameArchetype,
  mainWidth: number,
  genome: BaseGenome = SIGNATURE_GENOME
): PolylineSpec[] {
  return applyFractalRules(buildAct(archetype, mainWidth, genome), genome);
}

/** The five acts, one module each. An unrecognised archetype is the hero card, as it always was. */
function buildAct(archetype: FrameArchetype, mainWidth: number, genome: BaseGenome): PolylineSpec[] {
  switch (archetype) {
    case 'monogram_gate':
      return buildMonogramGate(genome);
    case 'ziggurat_chevron':
      return buildZigguratChevron(mainWidth, genome);
    case 'sunburst_octagon':
      return buildSunburstOctagon(mainWidth, genome);
    case 'diamond_gateway':
      return buildDiamondGateway(mainWidth, genome);
    default:
      return buildGrandHero(mainWidth, genome);
  }
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

