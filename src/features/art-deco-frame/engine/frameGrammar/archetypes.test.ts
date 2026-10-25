import { describe, expect, it } from 'vitest';
import type { FrameArchetype } from '../../model/types';
import { buildCoreFrameSpecs } from './archetypes';
import { buildDiamondGateway } from './acts/diamondGateway';
import { buildGrandHero } from './acts/grandHero';
import { buildMonogramGate } from './acts/monogramGate';
import { buildSunburstOctagon } from './acts/sunburstOctagon';
import { buildZigguratChevron } from './acts/zigguratChevron';
import { GENE_DEFINITIONS, SIGNATURE_GENOME, withGene } from './genome';
import type { PolylineSpec } from './types';

/**
 * How the five acts are wired together. The geometry of each act is pinned by the authored golden
 * snapshots; these tests pin what the snapshots cannot say: which act an archetype selects, what
 * each act takes as input, and how the fractal pass treats the rules it produces.
 */
const WIDTH = 5.4;
const G = SIGNATURE_GENOME;
const geometry = (specs: PolylineSpec[]) =>
  JSON.stringify(specs.map((s) => [s.points, s.closed ?? false, s.width, s.depth, s.z, s.delay, s.kind, s.partDir]));

describe('buildCoreFrameSpecs dispatch', () => {
  const cases: Array<[FrameArchetype, () => PolylineSpec[]]> = [
    ['monogram_gate', () => buildMonogramGate(G)],
    ['ziggurat_chevron', () => buildZigguratChevron(WIDTH, G)],
    ['sunburst_octagon', () => buildSunburstOctagon(WIDTH, G)],
    ['diamond_gateway', () => buildDiamondGateway(WIDTH, G)],
    ['gatsby_hero', () => buildGrandHero(WIDTH, G)],
  ];

  it.each(cases)('draws %s with its own act, untouched at the signature genome', (archetype, act) => {
    expect(geometry(buildCoreFrameSpecs(archetype, WIDTH))).toBe(geometry(act()));
  });

  it('gives every archetype a different frame', () => {
    const drawn = cases.map(([archetype]) => geometry(buildCoreFrameSpecs(archetype, WIDTH)));

    expect(new Set(drawn).size).toBe(5);
  });

  it('falls back to the hero lockup for an archetype it does not know', () => {
    const unknown = buildCoreFrameSpecs('nope' as FrameArchetype, WIDTH);

    expect(geometry(unknown)).toBe(geometry(buildGrandHero(WIDTH, G)));
  });

  it('uses the signature genome when none is given', () => {
    expect(geometry(buildCoreFrameSpecs('gatsby_hero', WIDTH))).toBe(
      geometry(buildCoreFrameSpecs('gatsby_hero', WIDTH, { ...G }))
    );
  });
});

describe('what each act takes as input', () => {
  it('lets the monogram gate ignore the title width, since it frames a fixed signet', () => {
    expect(geometry(buildCoreFrameSpecs('monogram_gate', 2))).toBe(geometry(buildCoreFrameSpecs('monogram_gate', 20)));
  });

  it.each(['ziggurat_chevron', 'sunburst_octagon', 'diamond_gateway', 'gatsby_hero'] as const)(
    'widens %s with the title once the title outgrows the minimum frame',
    (archetype) => {
      const narrow = buildCoreFrameSpecs(archetype, 1);
      const wide = buildCoreFrameSpecs(archetype, 20);
      const reach = (specs: PolylineSpec[]) => Math.max(...specs.flatMap((s) => s.points.map((p) => Math.abs(p.x))));

      expect(reach(wide)).toBeGreaterThan(reach(narrow));
    }
  );

  it.each(['ziggurat_chevron', 'sunburst_octagon', 'diamond_gateway', 'gatsby_hero'] as const)(
    'holds %s at its minimum width for a short title',
    (archetype) => {
      expect(geometry(buildCoreFrameSpecs(archetype, 0.5))).toBe(geometry(buildCoreFrameSpecs(archetype, 1)));
    }
  );

  it.each(['monogram_gate', 'ziggurat_chevron', 'sunburst_octagon', 'diamond_gateway', 'gatsby_hero'] as const)(
    'is mirror-symmetric about the vertical axis for %s, bar the interlocking monogram',
    (archetype) => {
      const rails = buildCoreFrameSpecs(archetype, WIDTH).filter((s) => s.kind !== 'monogram' && s.kind !== 'pinstripe');
      const key = (s: PolylineSpec, sign: number) =>
        JSON.stringify(
          s.points.map((p) => [Math.round(p.x * sign * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
        ) + `|${Math.round(s.z * 1e4)}|${Math.round(s.width * 1e4)}`;
      const seen = new Set(rails.map((s) => key(s, 1)));

      expect(rails.filter((s) => !seen.has(key(s, -1))).length).toBe(0);
    }
  );

  it('keeps the two interlocking G letterforms off the mirror, by design', () => {
    const letters = buildCoreFrameSpecs('monogram_gate', WIDTH).filter((s) => s.kind === 'monogram');

    expect(letters).toHaveLength(2);
    expect(letters.map((s) => s.partDir).sort()).toEqual([-1, 1]);
  });
});

describe('the fractal pass', () => {
  const withDepth = (depth: number, ratio = 0.45) =>
    withGene(withGene({ ...G }, 'fractalDepth', depth), 'fractalRatio', ratio);
  const ruleCount = (specs: PolylineSpec[]) => specs.filter((s) => s.kind === 'rule' && s.points.length === 2).length;

  it('is the identity at depth zero', () => {
    const plain = buildCoreFrameSpecs('ziggurat_chevron', WIDTH, withDepth(0));

    expect(geometry(plain)).toBe(geometry(buildZigguratChevron(WIDTH, withDepth(0))));
  });

  it('turns each two-point rule into 2^depth dashes and leaves every other rail alone', () => {
    const base = buildZigguratChevron(WIDTH, withDepth(0));
    const rules = ruleCount(base);

    for (const depth of [1, 2, 3]) {
      const dashed = buildCoreFrameSpecs('ziggurat_chevron', WIDTH, withDepth(depth));
      expect(ruleCount(dashed)).toBe(rules * 2 ** depth);
      expect(dashed.length - ruleCount(dashed)).toBe(base.length - rules);
    }
  });

  it('keeps the outer thirds and drops the middle of a rule at depth one', () => {
    const rule = buildZigguratChevron(WIDTH, withDepth(0)).find((s) => s.kind === 'rule' && s.points.length === 2)!;
    const dashes = buildCoreFrameSpecs('ziggurat_chevron', WIDTH, withDepth(1)).filter(
      (s) => s.kind === 'rule' && s.points.length === 2 && s.z === rule.z && s.partDir === rule.partDir && Math.abs(s.points[0].y - rule.points[0].y) < 1e-9
    );
    const [a, b] = rule.points;
    const along = (p: { x: number }) => (p.x - a.x) / (b.x - a.x);

    expect(dashes.map((d) => [along(d.points[0]), along(d.points[1])].map((v) => +v.toFixed(4)))).toEqual([
      [0, 0.3333],
      [0.6667, 1],
    ]);
  });

  it('thins the second and later dashes by the fractal ratio, and delays each a little more', () => {
    const rule = buildZigguratChevron(WIDTH, withDepth(0)).find((s) => s.kind === 'rule' && s.points.length === 2)!;
    const [first, second] = buildCoreFrameSpecs('ziggurat_chevron', WIDTH, withDepth(1, 0.5)).filter(
      (s) => s.kind === 'rule' && s.points.length === 2 && Math.abs(s.points[0].y - rule.points[0].y) < 1e-9 && s.z === rule.z
    );

    expect(first.width).toBeCloseTo(rule.width, 9);
    expect(second.width).toBeCloseTo(rule.width * 0.5, 9);
    expect(second.delay).toBeCloseTo(first.delay + 0.02, 9);
  });

  it('works on every act', () => {
    for (const archetype of ['monogram_gate', 'sunburst_octagon', 'diamond_gateway', 'gatsby_hero'] as const) {
      const flat = buildCoreFrameSpecs(archetype, WIDTH, withDepth(0));
      const deep = buildCoreFrameSpecs(archetype, WIDTH, withDepth(2));

      expect(ruleCount(deep)).toBeGreaterThan(ruleCount(flat));
    }
  });

  it('only ever sees depths the genome allows', () => {
    expect(GENE_DEFINITIONS.fractalDepth.max).toBe(3);
  });
});
