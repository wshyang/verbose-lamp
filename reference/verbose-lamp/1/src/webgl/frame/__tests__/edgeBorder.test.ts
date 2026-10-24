import { describe, expect, it } from 'vitest';
import {
  buildEdgeBorder,
  clampGenome,
  genomeForVariant,
  viewportScaleAtDistance,
  withGene,
  type BaseGenome,
} from '../index';
import { GENOME_PRESETS } from '../../../data/frameGenomeUi';
import { symmetryKeys } from './frameTestKit';

const ASPECT = 16 / 9;
const ASPECT_43 = 4 / 3;
const GENOMES: BaseGenome[] = [
  ...GENOME_PRESETS.map((preset) => preset.genome),
  ...[3, 12, 27].map(genomeForVariant),
];

function border(genome: BaseGenome, density: number, aspect = ASPECT) {
  return buildEdgeBorder({ aspect, genome, density });
}

function coordinates(specs: ReturnType<typeof buildEdgeBorder>['specs']) {
  return specs.flatMap((spec) => spec.points);
}

describe('screen border: geometry', () => {
  it('is deterministic', () => {
    expect(border(GENOME_PRESETS[0].genome, 0.5)).toEqual(border(GENOME_PRESETS[0].genome, 0.5));
  });

  it('is mirror-symmetric in x AND y, like the printed sheet', () => {
    // Border rails are undirected: a run drawn top-to-bottom is the same line as
    // bottom-to-top, so canonicalisation treats traversal direction as free.
    const undirected = (specs: ReturnType<typeof buildEdgeBorder>['specs']) =>
      symmetryKeys(
        specs.map((spec) => {
          const forward = JSON.stringify(spec.points);
          const backward = JSON.stringify([...spec.points].reverse());
          return {
            ...spec,
            points: forward <= backward ? spec.points : [...spec.points].reverse(),
          };
        })
      ).forward;

    for (const genome of GENOMES) {
      for (const density of [0, 0.35, 1]) {
        const { specs } = border(genome, density);
        const forward = undirected(specs);
        const flipX = undirected(
          specs.map((spec) => ({ ...spec, points: spec.points.map((point) => ({ x: -point.x, y: point.y })) }))
        );
        const flipY = undirected(
          specs.map((spec) => ({ ...spec, points: spec.points.map((point) => ({ x: point.x, y: -point.y })) }))
        );
        expect(flipX.sort(), `x@${density}`).toEqual(forward);
        expect(flipY.sort(), `y@${density}`).toEqual(forward);
      }
    }
  });

  it('stays inside the viewport for both common aspects', () => {
    for (const aspect of [ASPECT, ASPECT_43]) {
      for (const genome of GENOMES) {
        const { specs, extentX, extentY } = border(genome, 0.5, aspect);
        // the fan origin sits 0.02 inside the edge; nothing may cross it
        expect(extentX).toBeGreaterThan(aspect - 0.05);
        expect(extentY).toBeGreaterThan(1 - 0.05);
        for (const point of coordinates(specs)) {
          expect(Math.abs(point.x)).toBeLessThanOrEqual(aspect + 1e-9);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it('respects the rail and vertex budget at the extremes', () => {
    for (const genome of GENOMES) {
      for (const density of [0, 1]) {
        const { specs } = border(genome, density);
        const vertices = specs.reduce((total, spec) => total + spec.points.length * 2, 0);
        expect(specs.length, 'rails').toBeLessThan(1200);
        expect(vertices, 'vertices').toBeLessThan(60000);
        for (const spec of specs) {
          expect(spec.points.length).toBeGreaterThanOrEqual(2);
          expect(spec.width).toBeGreaterThan(0);
          expect(spec.delay).toBeGreaterThanOrEqual(0);
          expect(spec.delay).toBeLessThanOrEqual(0.7);
          expect(spec.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
        }
      }
    }
  });

  it('grows monotonically with weight: more rules, then denser reeding', () => {
    const counts = [0, 0.25, 0.5, 0.75, 1].map((density) => border(GENOME_PRESETS[0].genome, density).specs.length);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeGreaterThanOrEqual(counts[index - 1]);
    }
    expect(counts[0]).toBeGreaterThan(0);
  });

  it('responds to the genome groups that shape a border', () => {
    const reference = border(GENOME_PRESETS[0].genome, 0.5).specs.map((spec) => JSON.stringify(spec.points)).join('|');
    for (const probe of [
      { cornerScale: 1.6 },
      { zigguratSteps: 4 },
      { rayDensity: 1.5 },
      { raySpread: 0.8 },
      { rayReach: 1.3 },
      { wingSweep: 1.5 },
      { fractalDepth: 2 },
    ]) {
      const moved = border(withGene(GENOME_PRESETS[0].genome, Object.keys(probe)[0] as never, Object.values(probe)[0] as number), 0.5);
      expect(moved.specs.map((spec) => JSON.stringify(spec.points)).join('|'), JSON.stringify(probe)).not.toBe(reference);
    }
  });

  it('adds recursive detail only at depth >= 1', () => {
    const counts = [0, 1, 2, 3].map((fractalDepth) =>
      border(clampGenome({ fractalDepth }), 0.8).specs.filter((spec) => spec.role === 'fractal').length
    );
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[3]).toBeGreaterThanOrEqual(counts[2]);
  });

  it('contains the four border elements for every act of density', () => {
    const specs = border(GENOME_PRESETS[0].genome, 0.75).specs;
    const straightRuns = specs.filter((spec) => spec.points.length > 4);
    const ticks = specs.filter((spec) => spec.points.length === 2);
    expect(straightRuns.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeGreaterThan(8);
  });
});

describe('screen border: camera placement', () => {
  it('scales unit viewport space to fill the frustum exactly at the border distance', () => {
    const fov = THREE_FOV;
    const distance = 3;
    const scale = viewportScaleAtDistance(distance, fov);
    expect(scale).toBeCloseTo(distance * Math.tan(fov / 2), 12);
    // half-height of the frustum at that distance equals the scale, so y = ±1 lands on the edge
    expect(Math.atan(scale / distance) * 2).toBeCloseTo(fov, 12);
  });
});

const THREE_FOV = 42 * (Math.PI / 180);
