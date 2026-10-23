import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FrameArchetype } from '../../../types/sequence';
import { buildFrameGeometry } from '../index';

/**
 * CHARACTERIZATION CONTRACT — Addendum 0003, preservation guarantee 2.
 * Generated on 2026-10-23 from the untouched Addendum 0002 engine (tree of commit
 * d94139a) BEFORE the base-genome refactor. It freezes the whole intricacy family
 * the user approved, not only the 0.50 signature. Regenerating these hashes is a
 * product change and requires a superseding addendum (CLAUDE.md §2).
 */
const ARCHETYPES: FrameArchetype[] = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
];
const INTRICACY_SAMPLES = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.7, 0.85, 1];
const REFERENCE_WIDTH = 5.4;

function fingerprintRenderFields(archetype: FrameArchetype, intricacy: number): string {
  const { specs } = buildFrameGeometry({ archetype, mainWidth: REFERENCE_WIDTH, intricacy });
  const rails = specs.map((spec) => ({
    points: spec.points.map((point) => ({ x: point.x, y: point.y })),
    closed: Boolean(spec.closed),
    width: spec.width,
    depth: spec.depth,
    z: spec.z,
    delay: spec.delay,
    partDir: spec.partDir ?? 0,
  }));
  return createHash('sha256').update(JSON.stringify(rails)).digest('hex').slice(0, 20);
}

describe('intricacy family contract (pre-genome baseline)', () => {
  it('reproduces every pre-refactor intricacy render for the signature base', () => {
    const fingerprints = Object.fromEntries(
      ARCHETYPES.flatMap((archetype) =>
        INTRICACY_SAMPLES.map((intricacy) => [
          `${archetype}@${intricacy.toFixed(2)}`,
          fingerprintRenderFields(archetype, intricacy),
        ])
      )
    );

    expect(fingerprints).toMatchInlineSnapshot(`
      {
        "diamond_gateway@0.00": "9d8525ec0bb39282d146",
        "diamond_gateway@0.10": "96534d3062ea4db61445",
        "diamond_gateway@0.25": "ad68d1bb250a5bca9bd7",
        "diamond_gateway@0.40": "a8a1c361c72ace0f61df",
        "diamond_gateway@0.50": "649ed4716422e29f3e5a",
        "diamond_gateway@0.60": "649ed4716422e29f3e5a",
        "diamond_gateway@0.70": "5725c75226e3483e33ab",
        "diamond_gateway@0.85": "906a03f0424947f5e8e0",
        "diamond_gateway@1.00": "0cd4e484968617c37f15",
        "gatsby_hero@0.00": "2960baa272e0227015a2",
        "gatsby_hero@0.10": "43f8e37e3de652c1e7fb",
        "gatsby_hero@0.25": "dfb5006462f4fe083b02",
        "gatsby_hero@0.40": "e8dde3d45a00384a07c8",
        "gatsby_hero@0.50": "f8bea1721f3a1ab32cdc",
        "gatsby_hero@0.60": "f8bea1721f3a1ab32cdc",
        "gatsby_hero@0.70": "35ba9e36a968dfe6c51e",
        "gatsby_hero@0.85": "42e7e4b8c9dc071e0253",
        "gatsby_hero@1.00": "0ef4a44896fa68a32aaf",
        "monogram_gate@0.00": "6a11adc402628ca7665a",
        "monogram_gate@0.10": "656f44b2973c59379719",
        "monogram_gate@0.25": "a208534c7becd815cfb8",
        "monogram_gate@0.40": "fba1ef6fc83d62f3ca3c",
        "monogram_gate@0.50": "fba1ef6fc83d62f3ca3c",
        "monogram_gate@0.60": "fba1ef6fc83d62f3ca3c",
        "monogram_gate@0.70": "2e3f7525f36dccfcabdc",
        "monogram_gate@0.85": "cb15d268c968d4531622",
        "monogram_gate@1.00": "84f0697f962a1bb22731",
        "sunburst_octagon@0.00": "5dfd3174fe8ccdb2b99b",
        "sunburst_octagon@0.10": "fdca90d6898cfe30b90d",
        "sunburst_octagon@0.25": "5602e85ab2d5a9b503e7",
        "sunburst_octagon@0.40": "afb79975721174a5fab5",
        "sunburst_octagon@0.50": "44e2c3bb300041544fcc",
        "sunburst_octagon@0.60": "44e2c3bb300041544fcc",
        "sunburst_octagon@0.70": "5cd3659fdb976a3a2c50",
        "sunburst_octagon@0.85": "c3e4cf8535cbef86bbf6",
        "sunburst_octagon@1.00": "ce4fd5227f804fcd55f6",
        "ziggurat_chevron@0.00": "1e1d409f973de0312944",
        "ziggurat_chevron@0.10": "0a83d513657e4dc51cdf",
        "ziggurat_chevron@0.25": "99bf44f92fc62f5be646",
        "ziggurat_chevron@0.40": "490cbd9c8cebd494c63c",
        "ziggurat_chevron@0.50": "8ddc97001101b5bf5c67",
        "ziggurat_chevron@0.60": "8ddc97001101b5bf5c67",
        "ziggurat_chevron@0.70": "f8eff6fb9015271f8868",
        "ziggurat_chevron@0.85": "5bcf7baef86118b586a6",
        "ziggurat_chevron@1.00": "55f7caa0ee4558baa26e",
      }
    `);
  });
});
