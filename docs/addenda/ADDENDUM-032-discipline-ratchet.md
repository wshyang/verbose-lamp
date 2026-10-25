# ADDENDUM-032 — The coding disciplines as a test, and the first debt paid

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §3, §4, §7; BUILD_PROMPT §3;
ADDENDUM-001 §4 (known debt); ADDENDUM-028 §4 (the coverage ratchet);
ADDENDUM-031 §1.
**Status:** Implemented — 58 recorded debts remain, all pre-existing, none growing.
**Audience:** anyone about to add a function, and anyone asking "is the 50-line rule
real or aspirational?".

## 1. The problem with a prose rule

CLAUDE.md §3 lists hard limits — **functions ≤ 50 lines (≤ 20 target), ≤ 3
parameters, nesting ≤ 3, files ≤ 800 LOC.** Every one of them was, until now, a
sentence. Nothing in `npx tsc --noEmit`, `npm test` or `npm run build` noticed a
violation. That is the same class of gap ADDENDUM-031 §6 describes: a rule nobody
enforces is a wish.

The tree has real violations, and they are inherited: the three.js rigs, the geometry
primitives and the React components imported with the original repository. 58
functions currently break at least one limit, and the most extreme was
`decoTypography.createExtrudedDecoTextMesh` at **371 lines**.

## 2. The decision: a ratchet, not a clean sweep

Rewriting 58 functions in one round would be unverifiable without a browser, which is
exactly what the addenda discipline exists to prevent. Instead:

**`src/discipline.test.ts`** parses every non-test `.ts`/`.tsx` file with the
TypeScript compiler API and enforces five things:

1. **No file over 800 lines.** Currently zero violations — this one is absolute.
2. **No unrecorded function over a limit.** Any function breaking a limit must appear
   in `src/test/disciplineBaseline.ts`, or the build fails with its name, size, parameter
   count and nesting depth.
3. **No recorded function grows.** Each row carries a ceiling (`maxLines`,
   `maxParams`, `maxDepth`), not the current value, so a function may shrink without
   touching its row — but may never grow.
4. **No stale rows.** A row whose function was renamed or deleted fails, so the table
   cannot rot into fiction.
5. **The table can only shrink.** `DISCIPLINE_DEBT.length` is asserted `≤ 58`; the
   ceiling is lowered in the same commit as the payment, and raising it needs an
   addendum saying why.

Nesting is measured by walking the AST for `if`/`for`/`for…of`/`for…in`/`while`/
`do`/`switch`/`try`; parameters by the function's own parameter list; length by
source lines, comments included — the same way at every site, which is the property a
human review does not have.

Verified to bite: a probe function with 66 lines, 4 parameters and depth 4 appended to
`src/` failed with

```
+ "src/ratchetProbe.ts:tooLong (66 lines, 4 params, depth 4)"
```

## 3. The first debt paid, in the same round

`createExtrudedDecoTextMesh` — 371 lines, the worst offender — was **split into six
functions**, which is precisely what ADDENDUM-001 §4 prescribed ("Split rasteriser /
normal-synth / mesh on next touch"):

| Function | Responsibility | Lines |
|---|---|---|
| `layoutGlyphs` | glyph placement, tracking, canvas size, fit scale | ~40 |
| `strokeGlyph` | one glyph, pinstriped or solid | ~28 |
| `rasteriseMask` | the alpha mask for the whole word | ~28 |
| `chamferHeights` | two-pass chamfer distance → 0..1 heightfield | ~27 |
| `buildFaceMaps` | albedo/alpha canvas + chisel normal map | ~50 |
| `buildTextGroup` | front material, side material, slice stack | ~48 |
| `createExtrudedDecoTextMesh` | composes the six | ~40 |

### How a 371-line split was verified without a browser

**The test was written first, against the old code.** `decoTypography.test.ts`
(6 tests, jsdom) builds the rig for two option sets and captures a
`stableDigest`-hashed descriptor of everything the renderer reads back: world width
and height, slice count, slice z-positions and scales, plane size, both materials'
metalness/roughness/alphaTest/normalScale/envMapIntensity/colour, both program cache
keys, both texture image sizes, and the reveal/shimmer/opacity uniforms after a
`setReveal` call. Two inline snapshots were recorded **before** the refactor and
passed **unchanged** after it, which is what makes "pure code motion" a claim rather
than a hope.

The remaining four assertions cover behaviour the digest cannot: clamping
(`setReveal(-4, 7, 3)` → `0 / 7 / 1`), dispose-once for the plane, both materials and
both textures, the unknown-character fallback to the `O` skeleton, and the space
advance.

The split also introduced two >3-parameter helpers on the first attempt — caught by
the ratchet itself, and fixed by passing a request object (`ChamferRequest`,
`FaceRequest`, `GroupRequest`, `StrokeRequest`) rather than loosening the rule. Net
result: **62 → 58 recorded debts**, and `decoTypography.ts` contributes none.

## 4. What is deliberately still on the table

The 58 rows, grouped by the reason each carries in `src/test/disciplineBaseline.ts`:

| Reason | Count | Why it stands |
|---|---|---|
| `logic-orchestrator` | 18 | linear legacy orchestrators and rig builders; safe to move, not the highest-value work this round |
| `geometry-primitive` | 16 | parameters *are* drawing coordinates; an options object would hide them |
| `component` | 14 | React components rendering a subtree; splitting adds prop plumbing, not decisions |
| `render-rig` | 6 | three.js builders from the original import, pinned by geometry goldens and headless scene tests (ADDENDUM-029) |
| `feature-hook` | 4 | linear composition of several domains, each phase separately tested |

Two of these have a scheduled end: `GatsbySceneManager` (729 lines, five of its
functions) disappears when the screenshot gate passes and the R3F port becomes the only
renderer — ADDENDUM-026 §5. That removes the `render-rig` row for it and takes the
largest file in the tree with it.

## 5. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **121 files, 1135 tests**, green.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines.
- `npm run build` — succeeds.
- `src/discipline.test.ts` — 6 tests; one probe-verified failure mode.

**No browser in this sandbox; visual verification pending.** The `decoTypography` split
is guarded numerically, not visually: the digest proves the rig is the same object
graph with the same numbers, not that the type still looks right on screen. That check
belongs to the same pending screenshot pass as everything else.
