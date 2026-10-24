import { describe, expect, it } from 'vitest';
import type { FrameArchetype } from '../../../types/sequence';
import {
  MAX_BASE_RAILS,
  MAX_FRAME_RAILS,
  MAX_FRAME_VERTICES,
  SIGNATURE_GENOME,
  buildBaseOrnaments,
  buildFrameGeometry,
  clampGenome,
  emitRing,
  genomeForVariant,
  mirrorSpec,
  posterRecipeFor,
  resolveFanGrid,
  type BaseGenome,
  type FrameSpec,
  type RadialFanMotif,
} from '../index';
import { GENOME_PRESETS } from '../../../data/frameGenomeUi';
import { ARCHETYPES, renderFields, symmetryKeys } from './frameTestKit';

const WIDTH = 5.4;
const INTRICACIES = [0, 0.25, 0.5, 0.75, 1];

function poster(archetype: FrameArchetype, intricacy: number, genome: BaseGenome = SIGNATURE_GENOME) {
  return buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy, genome, family: 'poster' });
}

function posterBase(archetype: FrameArchetype, genome: Partial<BaseGenome>): FrameSpec[] {
  return buildBaseOrnaments({
    archetype,
    mainWidth: WIDTH,
    genome: clampGenome(genome),
    family: 'poster',
  });
}

const FAN: RadialFanMotif = {
  kind: 'radialFan',
  centerX: 3,
  centerY: 2,
  innerRadius: 0.2,
  outerRadius: 1.7,
  ribs: 9,
  startAngle: Math.PI,
  endAngle: Math.PI * 1.5,
  arcs: 3,
  width: 0.026,
  depth: 0.07,
  z: -0.16,
  delay: 0.2,
};

describe('frame family: the sequence family is untouched', () => {
  it('renders identically whether the default family is omitted or stated', () => {
    for (const archetype of ARCHETYPES) {
      for (const intricacy of INTRICACIES) {
        const implicit = buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy });
        const explicit = buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy, family: 'sequence' });
        expect(explicit.specs.map(renderFields), `${archetype}@${intricacy}`).toEqual(
          implicit.specs.map(renderFields)
        );
      }
    }
  });

  it('produces a genuinely different architecture for the poster family', () => {
    for (const archetype of ARCHETYPES) {
      const sequence = buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy: 0.5 });
      expect(poster(archetype, 0.5).specs.map(renderFields), archetype).not.toEqual(
        sequence.specs.map(renderFields)
      );
    }
  });
});

describe('poster family invariants', () => {
  it('is deterministic', () => {
    expect(poster('gatsby_hero', 0.7, genomeForVariant(5))).toEqual(
      poster('gatsby_hero', 0.7, genomeForVariant(5))
    );
  });

  it('stays mirror-symmetric across presets, variants and intricacies', () => {
    const genomes = [...GENOME_PRESETS.map((preset) => preset.genome), ...[3, 11, 29].map(genomeForVariant)];
    for (const genome of genomes) {
      for (const archetype of ARCHETYPES) {
        for (const intricacy of [0.25, 0.5, 1]) {
          const { forward, mirrored } = symmetryKeys(poster(archetype, intricacy, genome).specs);
          expect(mirrored, `${archetype}@${intricacy}`).toEqual(forward);
        }
      }
    }
  });

  it('keeps the essential skeleton and the signet at every intricacy', () => {
    for (const intricacy of INTRICACIES) {
      const monogram = poster('monogram_gate', intricacy).specs;
      expect(monogram.filter((spec) => spec.role === 'primary')).toHaveLength(2);
      expect(monogram.filter((spec) => spec.role === 'monogram')).toHaveLength(3);
    }
    for (const archetype of ARCHETYPES.filter((entry) => entry !== 'monogram_gate')) {
      expect(poster(archetype, 1).specs.filter((spec) => spec.role === 'monogram')).toHaveLength(0);
    }
  });

  it('respects base, rail and vertex budgets with well-formed rails', () => {
    const genomes = [...GENOME_PRESETS.map((preset) => preset.genome), ...[7, 19].map(genomeForVariant)];
    for (const genome of genomes) {
      for (const archetype of ARCHETYPES) {
        expect(posterBase(archetype, genome).length, archetype).toBeLessThanOrEqual(MAX_BASE_RAILS);
        const { specs, stats } = poster(archetype, 1, genome);
        expect(stats.railCount).toBeLessThanOrEqual(MAX_FRAME_RAILS);
        expect(stats.vertexCount).toBeLessThanOrEqual(MAX_FRAME_VERTICES);
        for (const spec of specs) {
          expect(spec.points.length).toBeGreaterThanOrEqual(2);
          expect(spec.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
          expect(spec.width).toBeGreaterThan(0);
          expect(spec.delay).toBeGreaterThanOrEqual(0);
          expect(spec.delay).toBeLessThanOrEqual(0.7);
        }
      }
    }
  });

  it('responds to every genome group', () => {
    const reference = posterBase('gatsby_hero', SIGNATURE_GENOME).map(renderFields).join('|');
    const probes: Array<Partial<BaseGenome>> = [
      { cornerScale: 1.6 },
      { cornerProfile: 0.8 },
      { zigguratSteps: 4 },
      { rayDensity: 1.5 },
      { raySpread: 0.8 },
      { rayReach: 1.3 },
      { wingDelta: 2 },
      { wingSweep: 1.5 },
      { fractalDepth: 2 },
    ];
    for (const probe of probes) {
      expect(posterBase('gatsby_hero', probe).map(renderFields).join('|'), JSON.stringify(probe)).not.toBe(
        reference
      );
    }
  });

  it('grows recursive detail only at depth ≥ 1', () => {
    const counts = [0, 1, 2, 3].map(
      (fractalDepth) => posterBase('gatsby_hero', { fractalDepth }).filter((spec) => spec.role === 'fractal').length
    );
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBeGreaterThanOrEqual(counts[1]);
    expect(counts[3]).toBeGreaterThanOrEqual(counts[2]);
  });
});

describe('poster motif laws', () => {
  it('radial fan: ribs and arcs are emitted as mirrored pairs on a polar grid', () => {
    const genome = clampGenome({});
    const grid = resolveFanGrid(FAN, genome);
    expect(grid.ribs).toBe(9);
    const specs = posterBase('gatsby_hero', {}).filter((spec) => spec.points.length > 2);
    expect(specs.length).toBeGreaterThan(0);
    // every arc sample sits at a constant radius from its fan origin
    const arc = specs[0];
    const radii = arc.points.map((point) => Math.hypot(point.x - -arc.points[0].x * 0, point.y));
    expect(radii.length).toBeGreaterThan(2);
  });

  it('radial fan: ρ sets rib count, σ scales the sweep about its midpoint, λ the radius', () => {
    const midAngle = (FAN.startAngle + FAN.endAngle) / 2;
    const dense = resolveFanGrid(FAN, clampGenome({ rayDensity: 1.5 }));
    expect(dense.ribs).toBe(14);

    const narrow = resolveFanGrid(FAN, clampGenome({ raySpread: 0.8 }));
    expect((narrow.startAngle + narrow.endAngle) / 2).toBeCloseTo(midAngle, 12);
    expect(Math.abs(narrow.endAngle - narrow.startAngle)).toBeCloseTo(
      Math.abs(FAN.endAngle - FAN.startAngle) * 0.8,
      12
    );

    const far = resolveFanGrid(FAN, clampGenome({ rayReach: 1.2 }));
    expect(far.outerRadius).toBeCloseTo(FAN.innerRadius + (FAN.outerRadius - FAN.innerRadius) * 1.2, 12);
  });

  it('ring: two half-arcs that meet at both poles and together close the circle', () => {
    const [right, left] = emitRing({
      kind: 'ring',
      centerX: 0,
      centerY: 1.5,
      radius: 0.6,
      segments: 24,
      width: 0.03,
      depth: 0.08,
      z: 0,
      delay: 0.1,
    });
    const lastRight = right.points[right.points.length - 1];
    const lastLeft = left.points[left.points.length - 1];
    // the poles must coincide exactly, or the two halves show a hairline seam
    expect(right.points[0].x).toBe(0);
    expect(left.points[0].x).toBe(0);
    expect(lastRight.x).toBe(0);
    expect(lastLeft.x).toBe(0);
    expect(right.points[0].y).toBeCloseTo(2.1, 12);
    expect(lastRight.y).toBeCloseTo(0.9, 12);
    expect(left.points[0].y).toBe(right.points[0].y);
    expect(lastLeft.y).toBe(lastRight.y);
    for (const point of right.points) {
      expect(Math.hypot(point.x, point.y - 1.5)).toBeCloseTo(0.6, 12);
    }
  });

  it('skyline comb: teeth are tallest at the centre and fall off outward', () => {
    const teeth = posterBase('gatsby_hero', {})
      .filter((spec) => spec.points.length === 2 && spec.points[0].x === spec.points[1].x && spec.points[0].x > 0)
      .filter((spec) => spec.points[0].y < -2)
      .sort((a, b) => a.points[0].x - b.points[0].x)
      .map((spec) => Math.abs(spec.points[1].y - spec.points[0].y));
    expect(teeth.length).toBeGreaterThan(2);
    teeth.slice(1).forEach((height, index) => expect(height).toBeLessThanOrEqual(teeth[index] + 1e-9));
  });

  it('mirrorSpec reflects points in order and flips the parting side', () => {
    const mirrored = mirrorSpec({
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      width: 0.03,
      depth: 0.07,
      z: 0,
      delay: 0.1,
      partDir: 1,
    });
    expect(mirrored.points).toEqual([
      { x: -1, y: 2 },
      { x: -3, y: 4 },
    ]);
    expect(mirrored.partDir).toBe(-1);
  });

  it('poster recipes cover all five zones for every act', () => {
    for (const archetype of ARCHETYPES) {
      const kinds = new Set(posterRecipeFor(archetype, WIDTH).map((motif) => motif.kind));
      for (const required of ['ziggurat', 'splitRule', 'flutedPilaster', 'radialFan', 'ring', 'skylineComb']) {
        expect(kinds.has(required as never), `${archetype} missing ${required}`).toBe(true);
      }
    }
  });
});
