# ADDENDUM-033 — The frame grammar, split by act, and the rail extruder, split by stage

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §3, §4; ADDENDUM-032 (the
discipline ratchet); ADDENDUM-002/014 (the frame grammar itself).
**Status:** Implemented — recorded debt 58 → **56**.
**Audience:** anyone touching an archetype, the shared rail extrusion, or asking why
the frame still looks the same after 400 lines moved.

## 1. Why these two files, and in this order

ADDENDUM-032 turned CLAUDE.md §3 into a test and paid the worst debt
(`decoTypography`, 371 lines in one function). The ratchet then named the next two
offenders by size:

| Function | Lines | Problem |
|---|---|---|
| `frameGrammar/archetypes.ts` `buildCoreFrameSpecs` | 292 | five archetypes in one `if/else if/else` chain, six levels of nesting |
| `render/railGeometry.ts` `appendChamferedPolyline` | 143 | arc length, mitring, cross-section, ring emission and seam stitching in one loop nest |

Both are **pure**: coordinates in, `PolylineSpec[]` or a `BufferGeometry` out, no
three.js state beyond the buffer being built, no clocks, no DOM. That is exactly the
class of file whose refactor can be proved by a golden rather than by looking at it,
which is the only kind that should be attempted without a browser.

## 2. `archetypes.ts`: five acts, one table

The dispatch chain became a lookup:

```ts
const ARCHETYPE_BUILDERS: Record<FrameArchetype, (context: BuildContext) => void> = {
  monogram_gate: buildMonogramGate,
  ziggurat_chevron: buildZigguratChevron,
  sunburst_octagon: buildSunburstOctagon,
  diamond_gateway: buildDiamondGateway,
  gatsby_hero: buildHeroLockup,
};

export function buildCoreFrameSpecs(archetype, mainWidth, genome = SIGNATURE_GENOME) {
  const specs: PolylineSpec[] = [];
  ARCHETYPE_BUILDERS[archetype]({ specs, mainWidth, genome });
  return applyFractalRules(specs, genome);
}
```

Eleven lines, one level of nesting, three parameters. Every builder receives the same
`BuildContext` (`specs`, `mainWidth`, `genome`) — a single request object rather than a
growing positional list, which is what the ratchet forced twice more inside the file
(`addHeroPlaque`, `addHeroCrown` take `HeroMetrics`).

Two of the five acts were still over 50 lines after the first cut, so the ratchet
caught them and they were split again rather than recorded:

| Archetype | Parts |
|---|---|
| ACT I `monogram_gate` | `addMonogramOctagons` · `addSignetColumns` · `addInterlockedMonogram` → `addLeftSignet` / `addSignetPinstripe` / `addRightSignet` · `addMonogramCrown` |
| ACT II `ziggurat_chevron` | one builder (fits: 25 lines) |
| ACT III `sunburst_octagon` | one builder (34 lines) |
| ACT IV `diamond_gateway` | one builder (32 lines) |
| ACT V `gatsby_hero` | `addHeroPlaque` · `addKeystoneArch` · `addHeroFrieze` · `addHeroFiligree` · `addHeroCrown` |

The parts are named for what they draw, not for their position in the file. A future
ACT VI is one entry in the table plus one builder, which is the whole point: the
dispatch used to be a place where a new act could silently land in the `else`
(Gatsby hero) branch.

The file grew 338 → 443 lines — comments and signatures, not geometry. The *functions*
are what the ratchet measures, and all fifteen are now under the limits.

## 3. `railGeometry.ts`: five stages, one plan object

The single function did arc-length measurement, mitre resolution, side selection, ring
emission and triangle stitching inside three nested loops. It is now:

| Stage | Function | Notes |
|---|---|---|
| measure | `measureRail` | cumulative arc length, `closed` handling, returns `null` when too short |
| direction | `direction` | unit segment vector with a zero guard |
| mitre | `miterAt` | closed/interior mitre with the `0.38` dot floor and `2.3` spike clamp; single-segment ends for an open polyline |
| side | `partingSide` | explicit `partDir` wins, else the side of the frame's centroid |
| section | `sectionOf` + `profileOf` | the six-vertex cross-section, generated from the spec's width/depth |
| emit | `pushRing`, `emitSeams` | one ring of six vertices; quads → triangles |

Everything mutable travels in a `RailPlan` (`acc`, `spec`, `points`, `cumLen`,
`totalLen`, `closed`, `ringCount`, `baseVertex`, `centerX`), so each stage takes one
parameter and the emitter functions cannot disagree about the ring count.

`centerX` moved from "recomputed per ring" to one field on the plan. The value is
identical — it is a mean over the same points — but it is now computed once per spec
instead of once per ring.

## 4. The proof: goldens captured first, twice

**`railGeometry.test.ts` is new (9 tests)** and was written against the *unsplit* file,
capturing two inline `stableDigest` snapshots — an open three-point rule and a closed
octagon — over the full uploaded buffer: positions, normals, `aPathData`, the index
array and order, the bounding-sphere radius. Both snapshots passed **unchanged** after
the split.

Writing it first also found three things worth knowing, each now asserted:

- **A collapsed two-point line still extrudes.** Every segment contributes
  `Math.max(1e-4, length)`, so `totalLen` can never be below `1e-4`; the
  `totalLen < 1e-4` early return is belt-and-braces, kept and documented rather than
  deleted. The test asserts the real behaviour (12 vertices, 30 indices) so nobody
  later "fixes" the guard into a behaviour change.
- **The cross-section normals are not exactly unit length** — the crest pair is
  hand-tuned to `(-0.25, 0.968)`, which is 0.99978 long. Renormalising would move the
  highlight a hair, so the test allows 5e-4 and says why.
- **`aPathData` is `Float32`.** A `delay` of `0.2` reads back as `0.20000000298`, so
  the reveal-channel assertions compare with `toBeCloseTo`, not `toEqual`.

**`archetypes.ts` had no direct test of its own** — it is covered through
`variants.test.ts` (77 assertions over the five archetypes), `golden.test.ts` (5
recorded geometry fingerprints) and `grammar.test.ts` (47). Those passed untouched,
which is the same evidence: the specs produced for every archetype, at every genome in
the suite, are byte-identical.

## 5. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **122 files, 1144 tests**, green.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines;
  `archetypes.ts` 100/100/100/100.
- `npm run build` — 2052.76 kB single file (787.69 kB gzip).
- `src/discipline.test.ts` — 6 tests; `DISCIPLINE_DEBT.length ≤ 56`; the two removed
  rows are `archetypes.ts::buildCoreFrameSpecs` and
  `railGeometry.ts::appendChamferedPolyline`.

**No browser in this sandbox; visual verification pending.** The digests prove the
buffers are the same numbers in the same order. They cannot prove the frame *reads*
the same on screen — mip-mapping, tone mapping and the bloom pass are outside the
buffer. That check rides with the pending screenshot pass.

## 6. What the ratchet has taught so far

Ten functions have been split across two rounds and not one split has been a
behaviour change, because in every case the goldens were captured before the scissors
came out. The order matters: a digest recorded *after* a refactor only records the
refactor's own output, which is the same self-certification failure ADDENDUM-031 §6
describes for the walk halo.
