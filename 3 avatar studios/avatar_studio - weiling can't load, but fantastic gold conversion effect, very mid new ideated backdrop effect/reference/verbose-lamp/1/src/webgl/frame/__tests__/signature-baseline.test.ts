import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildFrameGeometry } from '../index';

/**
 * CONTRACT FIXTURE PROVENANCE
 * Generated on 2026-10-23 from the pre-refactor `buildFrameSpecs` implementation
 * (git baseline 8884bf7) for the five archetypes at main-text width 5.4.
 * It freezes the rendered signature look at intricacy 0.50. Regenerating it is a
 * product change and requires a superseding addendum (CLAUDE.md §2).
 */
const ARCHETYPES = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
] as const;

const REFERENCE_WIDTH = 5.4;
const OTHER_WIDTHS = [3.2, 6.8];

interface RenderRail {
  points: Array<{ x: number; y: number }>;
  closed: boolean;
  width: number;
  depth: number;
  z: number;
  delay: number;
  partDir: number;
}

/**
 * Projects a spec onto the fields that actually reach the GPU. Non-rendering
 * metadata (role) is intentionally excluded so it can be added freely.
 */
function projectRenderFields(
  specs: Array<{
    points: Array<{ x: number; y: number }>;
    closed?: boolean;
    width: number;
    depth: number;
    z: number;
    delay: number;
    partDir?: number;
  }>
): RenderRail[] {
  return specs.map((spec) => ({
    points: spec.points.map((point) => ({ x: point.x, y: point.y })),
    closed: Boolean(spec.closed),
    width: spec.width,
    depth: spec.depth,
    z: spec.z,
    delay: spec.delay,
    partDir: spec.partDir ?? 0,
  }));
}

function fingerprint(archetype: (typeof ARCHETYPES)[number], width: number): string {
  const rails = projectRenderFields(buildFrameGeometry({ archetype, mainWidth: width, intricacy: 0.5 }).specs);
  return createHash('sha256').update(JSON.stringify(rails)).digest('hex');
}

describe('signature geometry contract (pre-refactor baseline)', () => {
  it('matches the frozen signature snapshot at reference width', async () => {
    const project = Object.fromEntries(
      ARCHETYPES.map((archetype) => [
        archetype,
        projectRenderFields(
          buildFrameGeometry({ archetype, mainWidth: REFERENCE_WIDTH, intricacy: 0.5 }).specs
        ),
      ])
    );

    await expect(`${JSON.stringify(project, null, 2)}\n`).toMatchFileSnapshot(
      '../__fixtures__/signature.json'
    );
  });

  it('matches the frozen fingerprints at non-reference widths', () => {
    const fingerprints = Object.fromEntries(
      ARCHETYPES.flatMap((archetype) =>
        OTHER_WIDTHS.map((width) => [`${archetype}@${width}`, fingerprint(archetype, width)])
      )
    );

    expect(fingerprints).toMatchInlineSnapshot(`
      {
        "diamond_gateway@3.2": "649ed4716422e29f3e5a54dd19b165b7f6a8ee55e6d6f1f56c17ce9aba2cc106",
        "diamond_gateway@6.8": "fdd61a5237ef3e2a5fffb159f3559ec3416ae3f449514d8e950f5e2424a4e3cd",
        "gatsby_hero@3.2": "f8bea1721f3a1ab32cdc12ac8535df56291db2e5bd67c4a3f43c002ef9f89897",
        "gatsby_hero@6.8": "18748ec74fd4a0bb45b3692fd9f93b4d9c453ecd141789792eae8a31fc10bbb2",
        "monogram_gate@3.2": "fba1ef6fc83d62f3ca3cc20b3ae37f8199d6d8f1493fef95ffbd1e1cf2e3930e",
        "monogram_gate@6.8": "fba1ef6fc83d62f3ca3cc20b3ae37f8199d6d8f1493fef95ffbd1e1cf2e3930e",
        "sunburst_octagon@3.2": "44e2c3bb300041544fcc4bdf2493e5caf6b4d82afb49b4cf0c3c70422d1d7bf5",
        "sunburst_octagon@6.8": "140291bf4381d3e04f11dc53ac45aff271dd85d8a78e4ee15839f81072fc3502",
        "ziggurat_chevron@3.2": "8ddc97001101b5bf5c67a972fd1739b13f76753f83b373dc5b1e6bf504bccc3b",
        "ziggurat_chevron@6.8": "dff9f20acfb1cc1d4c5d36b7ed5d8b5443cf1a7d29dd7a5661748e5e03f7b213",
      }
    `);
  });
});
