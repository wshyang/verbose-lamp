import { describe, expect, it } from 'vitest';
import { buildFrameSpecs } from './index';
import { FrameArchetype } from '../../types/sequence';

/**
 * Golden snapshot of the hand-authored frame geometry as delivered before the
 * intricacy refactor (ADDENDUM-002 step 1). Compares geometry fields only, so later
 * metadata annotations (kind, rank) cannot break it; only a change to what is drawn
 * at the Film Baseline can.
 */
const ARCHETYPES: FrameArchetype[] = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
];

const FIXED_MAIN_WIDTH = 5.4;

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export const toGeometryOnly = (specs: ReturnType<typeof buildFrameSpecs>) =>
  specs.map((s) => ({
    points: s.points.map((p) => [round(p.x), round(p.y)]),
    closed: Boolean(s.closed),
    width: round(s.width),
    depth: round(s.depth),
    z: round(s.z),
    delay: round(s.delay),
    partDir: s.partDir ?? 0,
  }));

describe('golden frame geometry (Film Baseline)', () => {
  for (const archetype of ARCHETYPES) {
    it(`${archetype} matches the delivered geometry`, () => {
      const specs = buildFrameSpecs(archetype, FIXED_MAIN_WIDTH);
      expect(specs.length).toBeGreaterThan(0);
      expect(toGeometryOnly(specs)).toMatchSnapshot();
    });
  }
});
