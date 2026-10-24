# ADDENDUM-021 — Deco Lattice frames: the film's octilinear line-bundle style, generated mathematically (assessment and plan)

**Date:** 2026-10-24 · **Relates to:** BUILD_PROMPT §3 (frame language, palette), §4, §7; CLAUDE.md §1, §2, §6. Extends ADDENDUM-004 (genesis axis), ADDENDUM-006/009 (poster surface), ADDENDUM-012 (composable layers). Independent of ADDENDUM-020; see §9 for the one shared file.
**Status:** Accepted (plan). Not implemented yet. Implementation records take the next free addendum numbers, one per phase.
**Audience:** the agent doing the implementation. Read this whole file before writing code.

---

## 0. First step for the implementer

This plan is already saved and listed in `docs/ADDENDA.md`. Before any code:
1. Read §2–§3. Open `engine/frameGrammar/{types,generative,grammar,primitives,edgeBorder}.ts` and `render/{railGeometry,frameMaterial}.ts` under `src/features/art-deco-frame/`.
2. Start phase 1 (§7) on a fresh branch.

## 1. Context

The user asked for an assessment of the SpoonGraphics tutorial *"How To Create a Great Gatsby Style Art Deco Pattern"* (Chris Spooner, 2015; https://blog.spoongraphics.co.uk/tutorials/how-to-create-a-great-gatsby-style-art-deco-pattern), and of how to generate that style of frame programmatically and mathematically. The user's view is that **this style matches the 2013 film more closely** than our current frames. A PDF of the article with its images was supplied locally (`~/Downloads/How To Create a Great Gatsby Style Art Deco Pattern.pdf`, 26 pages). **Do not commit it or its images: they are the author's copyright.** If you need a local copy, put it under `reference/` (git-ignored).

The goal is a new frame family that reproduces the look of this tutorial from rules and a seed rather than by tracing. It must plug into the existing frame engine so that title cards, the screen border and 2D UI can all use it.

## 2. Assessment — what the tutorial actually builds

Read from the step images, not just the text.

### 2.1 Construction
1. **Guides:** a horizontal and a vertical line through the centre, plus both 45° diagonals. That gives 8 rays. All later drawing is constrained to **0°, 45° and 90° only** (Shift-constrained pen).
2. **Layer 1, border (heavy):** the pen at **20 pt**, then **10 pt**, then finer strokes. The artist draws a stepped, castellated path that "flows in random directions" between the diagonal and the horizontal guide, inside **one 45° wedge (1/8 of the square)**. Then: reflect it vertically, rotate the copy 90°, and repeat until all four sides are filled. The result (page 7) is:
   - a **stepped outer border** with 2–3 battlement steps at each corner;
   - a **mid-edge clasp** on every side: a long trapezoid/hexagon with 45° ends, holding a chevron;
   - **straight frame bars** on all four sides, each with 2–3 **parallel inner rails**.
3. **Layer 2, star (medium):** a square plus the same square rotated 45°, merged with Pathfinder, gives an **8-pointed star (octagram)**. Its outline is the 10 pt stroke.
4. **Layer 3, fill (fine):** between the star and the frame, **bundles of 2–4 parallel 45° lines** that turn to 90° near the frame (pages 10–11). They are drawn in one wedge and reflected and rotated again. Inside the star: a **thick diagonal X band**, **axis arrows/chevrons** pointing outward, and **nested star or diamond outlines** (pages 12–13). There is advice to leave outlined slots where text could sit.
5. **Layer 4, finishing:** **corner diamonds** (squares rotated 45°) sit in the empty corner cells. **Reed rows** of thin equal rectangles, equally spaced and recentred so the end gaps match (Transform Again, then scale to fit), fill the long thin bands. They are rotated 90° for the side bands.
6. **Finish (Photoshop):** black ground. Per layer: a **gradient overlay alternating brass `#775320` (dark) and `#ba9c72` (light)**, with the **angle changed per layer** so colour flow looks random; **Bevel & Emboss, Chisel Hard, 1 px**; a **drop shadow (Linear Burn, large, low opacity)**, which gives depth between layers. Overall: **scratched-metal texture with vertical grain, Overlay 30%**; a **multi-stop black/white diagonal gradient, Soft Light 95%** (banded raking light); **soft white spots, Overlay** (glints). Layer opacities vary for tonal range.

### 2.2 The mathematics hidden in it
| Visual trait | Formal description |
|---|---|
| 0/45/90° only | **Octilinear polylines.** Every segment direction is one of 8 unit vectors `d_k = (cos kπ/4, sin kπ/4)`. Vertices snap to a lattice `u·ℤ²`, so diagonals use `(±1, ±1)·u` steps. |
| Draw 1/8, reflect + rotate | The **dihedral group D4** (order 8) acts on a **fundamental domain**, the wedge `0 ≤ y ≤ x`. The full pattern is the orbit of the wedge content. A non-square frame only has **D2** (the Klein four-group: identity, reflect in x, reflect in y, rotate 180°), see §3.4. |
| Strokes in groups | **Parallel offset bundles.** One centreline, offset by `±j·s`. At an octilinear corner with turn angle θ, the offset vertex moves along the bisector by `d / cos(θ/2)`: `1.0824 d` for 45° turns and `√2 d` for 90° turns. That is exact, so no miter clamp is needed. |
| 20 / 10 / ~4 / ~2 pt | A **weight hierarchy** with ratio about 1 : ½ : ⅕ : ⅒. It maps directly onto our `rank` 0–3 (ADDENDUM-002), so the Intricacy slider drops the finest layer first. |
| Octagram | The union of square `[-a, a]²` and its 45° rotation is a 16-gon (the star polygon {8/2} outline). Its vertices alternate between `r_out = a√2` at angles `kπ/4` and `r_in = a·sec(π/8)` at angles `π/8 + kπ/4`. A closed form, so there is no boolean union. |
| Reed rows | **1D tiling with equal gaps.** For band length `L`, bar width `w` and target gap `g`: `n = ⌊(L − g)/(w + g)⌋`, then the exact gap is `g' = (L − n·w)/(n + 1)`. |
| Corner diamonds, clasps | Placed at **special points of the symmetry group**: diagonal and axis points. They are fixed by a reflection, so each sits on a mirror line, and the orbit gives 4 copies, not 8. |
| "Random" fill | **Constrained random walks on the octilinear lattice** inside the wedge, with occupancy (no overlaps, perpendicular crossings allowed), a minimum run length, and turns of only 0/±45/±90°. Seeded, so the result can be reproduced. |
| Measured layout (final render, half-extent = 1, ±0.03) | Outer border at 1.00; heavy frame bar centre about 0.75, width about 0.06; reed band about 0.62–0.70; corner-diamond cell about 0.12 at (±0.66, ±0.66); octagram `a√2` about 0.56; X band reaches about 0.38; clasp spans about 0.45 of a side. |

### 2.3 Gap against what we have
- Our current frames (`authored`, `fractal`, `rosette`, `arcade`, and the poster `edgeBorder`) are made of **single heavy rails**, sunburst fans, arcs and octagons. None of them has the film's signature: **many thin parallel strands routed at 45/90° in bundles, a dense multi-weight fill, an octagram centre, and reed rows.** That is why this tutorial reads as "more like the movie".
- What we can reuse: the rail renderer handles any polyline and mitred joins (`railGeometry.ts`); `PolylineSpec` already carries `kind`, `rank`, `z`, `delay` and `partDir`; the rank/intricacy grammar; the `FrameSource` + layers plumbing (Frame Studio lists sources automatically, `useFrameStudio.ts:163`); `reflectX`/`reflectY` patterns (`edgeBorder.ts:55–68`); `mirrorHalves` (`generative.ts:50`).
- What is missing: lattice snapping, D4/D2 orbit tooling, exact octilinear offsets (`offsetPolylineOutward` in `grammar.ts:102` offsets away from the origin and clamps miters, which is wrong for bundles), seeded walks, octagram, equal-gap tiling, polygon clipping, and a **brass** finish (our gold is a bright `#f4c95d`; the tutorial's brass is a muted antique `#775320`→`#ba9c72`).

## 3. Design

### 3.1 New pure engine: `src/features/art-deco-frame/engine/decoLattice/`
No Three.js, no DOM. Every file is tested and at most 400 LOC.

| File | Responsibility |
|---|---|
| `lattice.ts` | `OCTI_DIRS`, `snapToLattice(p, u)`, `isOctilinear(points)`, `turnAngle(a, b, c)`. |
| `symmetry.ts` | `D4` and `D2` as integer 2×2 matrices; `orbit(specs, group)` with dedupe of copies that fall on mirror lines (stable key = rounded sorted points + z + width); `inWedge(p)`. |
| `bundle.ts` | `offsetSide(points, d)` (signed, exact `d/cos(θ/2)` octilinear miter); `bundle(centreline, { strands, spacing, weights })` gives parallel rails. |
| `walk.ts` | `traceWalks({ seed, wedge, cell, count, minRun, maxTurns, keepOut })`: seeded constrained walks on an occupancy grid. They start on a guide or the star edge, grow by weighted choices {straight 0.55, ±45° 0.3, ±90° 0.15}, never leave the wedge or enter `keepOut`, and stop on an obstacle or a guide. |
| `motifs.ts` | Parameterized, closed-form motifs: `octagram(a)`, `nestedOctagram(a, k, ratio)`, `diagonalCross(len, w, notch)`, `axisArrow(at, len)`, `steppedBorder(half, steps, depth)`, `trapezoidClasp(centre, span, chevrons)`, `cornerDiamond(at, r)`, `reedRow(segment, w, g)` (2-point ticks, equal-gap formula), `hatchBundle(region, angle, spacing)` (clip to a convex polygon with Cyrus–Beck). |
| `clip.ts` | `clipSegmentToConvex`, `clipPolylineOutside(rect)`. Used for apertures and text slots. |
| `composition.ts` | `buildDecoLattice(request): DecoLatticeGeometry`, the four-layer recipe in §3.2. |
| `nineSlice.ts` | Rectangle support, §3.4. |
| `presets.ts` | `as const` presets: `spooner-medallion` (reproduces the tutorial layout from §2.2 measurements), `premiere-frame`, `invitation-panel`, `screen-proscenium`. |

```ts
interface DecoLatticeRequest {
  mode: 'medallion' | 'frame';          // frame = aperture kept clear for text (tutorial's closing advice)
  halfExtent: { hw: number; hh: number };
  aperture?: { hw: number; hh: number }; // required when mode = 'frame'
  textSlots?: readonly Rect[];           // extra keep-out cartouches
  seed: number;                          // default 1925
  density: number;                       // 0..1 → walk count, bundle strands, reed density
  recipe: DecoLatticeRecipe;             // which motifs per layer; preset supplies it
}
interface DecoLatticeGeometry {
  specs: PolylineSpec[];                 // kinds + ranks + z already set
  bounds: { hw: number; hh: number };
}
```

### 3.2 Four-layer recipe (same as the tutorial)
| Layer | Content | Weight (× heavy) | `kind` → `rank` | `z` |
|---|---|---|---|---|
| L1 Border | `steppedBorder`, frame bars + 2–3 inner rails (`bundle`), `trapezoidClasp` per side | 1, ½ | `frame` 0 / `rule` 1 | 0 |
| L2 Star | `octagram` outline, plus `nestedOctagram` echoes | ½ | `star` 1 | −0.02 |
| L3 Fill | `traceWalks` bundles in the wedge (orbited), `hatchBundle` between star and frame; in medallion mode also `diagonalCross` and `axisArrow`s | ⅕ | `lattice` 2 / `chevron` 2 | −0.04 |
| L4 Finish | `cornerDiamond`s, `reedRow`s in the long bands | ⅒–⅕ | `diamond` 2 / `reed` 3 | −0.05 |

- **New `RailKind` values:** `star`, `lattice` and `reed`. Add them to `BASE_RANK`, `GENERATION_CAP` and `PRODUCTIONS` in `grammar.ts` (both are `Record<RailKind,…>`, so tsc will flag any you miss). Elaboration rules: `star` echoes inward (`nestedOctagram`); `lattice` adds one extra parallel strand per generation; `reed` gets no elaboration (density already controls it).
- The **z step per layer** stands in for the tutorial's per-layer drop shadow: lower layers sit visibly behind upper ones and catch less light. Draw-on `delay` runs L1 first, then L2, L3, L4, so the reveal animation follows the tutorial's build order.
- **Only the wedge is generated.** The orbit makes the rest. Motifs that sit on mirror lines are emitted once, and orbit dedupe removes duplicates. The tutorial hit exactly this ("Duplicates of the centre star shape have been building up… delete the unwanted extras").

### 3.3 Seeded walks: the "random directions" made reproducible
- Grid cell `u = heavy/2`. The occupancy grid covers the wedge only. A cell is reserved when a bundle passes through it, plus a 1-cell halo, so strands never touch at an angle. Crossing is only allowed at 90° through a straight run, which is how the tutorial's fills interlace.
- Bundle width (1–4 strands) is drawn per walk from `density`. Turns are mitred exactly (`bundle.ts`), so strand spacing stays constant through 45° bends, the property that makes the tutorial look engineered.
- If the grid is too crowded, a walk stops early. It never throws. The final spec count is capped by the vertex budget (§5).
- The RNG is mulberry32 in `src/shared/lib/random.ts`. ADDENDUM-020 plans the same file. Whichever lands first creates it, and the other reuses it.

### 3.4 Rectangles (title cards are about 2:1, the viewport up to 3.2:1)
D4 only holds for squares, so non-square frames use a **nine-slice decomposition**:
- **Corners:** square blocks of side `c = min(hh, hw)·cornerRatio`, generated with full D4 symmetry inside the block, then placed by D2. This keeps the tutorial's diagonal corner structure.
- **Edges:** **frieze bands**, 1D patterns with a translation period `p` plus a mirror at mid-edge. The band length `L` is filled with `n = ⌊L/p⌋` periods, and the remainder goes to a centred clasp, so it never ends on a fragment. Reeds use the equal-gap formula.
- **Centre:** in `medallion` mode, an octagram scaled to the inscribed square, with lattice hatching filling the leftover width. In `frame` mode, the aperture is clear.
- Tests: the D2 orbit is exact for any aspect; every edge-band count is an integer; nothing crosses the aperture or a text slot.

### 3.5 Integration points (all opt-in; nothing existing changes appearance)
1. **Title-card genesis source `lattice`.** Add `'lattice'` to `FrameSource` and `FRAME_SOURCES` ("Deco Lattice: the film's parallel-line bundles on a 45° lattice") and add a branch to `buildGenerativeFrameSpecs`. `frame` mode uses `frameBox(archetype)` as the extent and the typography clearance as the aperture. `level` 1–4 maps to recipe depth: L1; L1+L2; L1–L3; L1–L4. It also works as a composable layer (ADDENDUM-012), so `authored` plus a `lattice` overlay is possible.
2. **Optional `FrameFormula.seed?: number`** (default 1925). Frame Studio gets a "Reroll pattern" button (`frame-studio__reroll`) that is shown only when `lattice` is active, through the existing hook-decides/component-renders split.
3. **Screen border.** Add `ScreenBorderStyle.pattern?: 'poster' | 'lattice'` (default `'poster'`, the current geometry) and branch in `buildEdgeBorder`. The lattice proscenium uses nine-slice with a clear aperture, so the viewport still reads.
4. **2D SVG renderer** for UI, invitations, menus and table cards: `render/decoLatticeSvg.ts` (pure `specs → SVG path data`, snapshot-tested) and a thin `DecoLatticeFrame` React component. Strokes become `<path stroke-linejoin="miter">` grouped by layer. One `<defs>` holds a per-layer brass `linearGradient` (angle from the seed), a chisel bevel (`feSpecularLighting` with a 1 px `feMorphology` edge), a drop shadow (`feDropShadow`, multiply), scratch grain (`feTurbulence`, stretched vertically, overlay 0.3), and a raking banded gradient (soft light). Export SVG/PNG by reusing the `qr-generator` export helpers. ADDENDUM-020's gilded UI kit can take these frames as panel backgrounds.
5. **Barrel:** export `buildDecoLattice`, the presets, the types and `DecoLatticeFrame` from `@/features/art-deco-frame`. Update `docs/ARCHITECTURE.md`.

### 3.6 Brass finish for WebGL (the movie look)
- Add an optional `finish?: 'gold' | 'brass'` to `createGoldFrameMaterial` (default `'gold'`, so unchanged and with its existing `customProgramCacheKey`). Brass means: albedo `#ba9c72`, a dark tone `#775320` blended by a per-rail **tone** value, roughness about 0.32, metalness 0.9.
- **Per-layer gradient angle:** `railGeometry` gains an optional `aTone` attribute (vec2: base tone, gradient angle) taken from a new optional `PolylineSpec.tone?`. It is absent by default. The golden snapshot compares geometry fields only (`golden.test.ts:22`), so it stays green. The phase record must still say so explicitly.
- **Scratches:** a procedural anisotropic hash-line normal perturbation in the fragment shader, with vertical grain and about 30% strength. **Banded raking light:** a multi-stop diagonal emissive band, like the tutorial's Soft Light gradient, sweeping with the existing `uTime` sheen. **Glints:** sparse hash-gated specular spots. Bevel and drop shadow already come from the chamfered cross-section and the layer z-steps.

## 4. Module map (new and changed)

```text
src/shared/lib/random.ts                                  (shared with ADDENDUM-020)
src/features/art-deco-frame/engine/decoLattice/
  lattice.ts symmetry.ts bundle.ts walk.ts motifs.ts clip.ts
  composition.ts nineSlice.ts presets.ts index.ts  (+ *.test.ts beside each)
src/features/art-deco-frame/render/decoLatticeSvg.ts      specs → SVG paths (pure)
src/features/art-deco-frame/components/DecoLatticeFrame.tsx  thin SVG component + brass defs
changed: frameGrammar/types.ts (FrameSource, RailKind, seed?, tone?, ScreenBorderStyle.pattern?)
         frameGrammar/generative.ts (lattice branch) · frameGrammar/grammar.ts (3 kinds)
         frameGrammar/edgeBorder.ts (pattern branch) · render/railGeometry.ts (aTone)
         render/frameMaterial.ts (finish) · frame-studio hook/control (reroll)
```

## 5. Constraints and budgets
- **Vertex budget:** the existing generative test caps Baroque at **≤ 1200 points** (`generative.test.ts:62–65`) and loops over every `isGenerative` source, so `lattice` is tested automatically. Meet the budget through `density` caps: reeds are 2-point ticks, walks are capped, and orbit dedupe applies. Raise the cap only with a measured reason in the phase record.
- That same loop also requires x-mirror symmetry, determinism, and a monotone spec count as `level` rises. D2 and D4 orbits satisfy the first. The second needs a fixed seed. The third means each level must be a superset of the previous one.
- Minimal intricacy must keep a closed rank-0 primary frame (`generative.test.ts:97–103`). L1's frame bar is that rank-0 rail.
- Functions ≤ 50 lines, files ≤ 400 LOC. `edgeBorder.ts` is at 276 lines, so put the lattice proscenium in `decoLattice/`, not in `edgeBorder.ts`.

## 6. Tests (pure; geometry snapshots, not pixels)
`isOctilinear` holds for every emitted rail · lattice snap idempotent · D4/D2 orbit sizes (generic 8/4; mirror-line motifs dedupe to 4/2) · `offsetSide` keeps exact perpendicular spacing through 45° and 90° turns · octagram vertices equal the closed form, and equal a brute-force union of the two squares at 1e-9 · reed equal-gap formula (both end gaps equal `g'`) · `traceWalks` deterministic per seed, never leaves the wedge, never enters `keepOut`, no non-perpendicular overlaps · Cyrus–Beck clip cases · nine-slice: integer counts, aperture clear, D2-exact for aspect 1, 2, 3.2 · `spooner-medallion` geometry snapshot (seed 1925) plus checks that its measured landmarks (§2.2) are within ±0.03 · `lattice` source passes the existing generative suite · SVG path snapshot · `screen-border` lattice stays inside the viewport extents.

## 7. Phases (each: tests first → code → `tsc` / `vitest` / `build` → phase record → commit with caveat)
1. **Math core:** `random`, `lattice`, `symmetry`, `bundle`, `clip`, `motifs` (octagram, reeds, diamonds, border, clasp).
2. **Composition** + `spooner-medallion` preset + SVG renderer + `DecoLatticeFrame`. This gives the first visual result, and the user can check it against the tutorial side by side.
3. **Seeded walks** (`walk.ts`) for the L3 fill, plus density and level mapping.
4. **Title-card source** `lattice` + `seed` + Frame Studio reroll; the three new `RailKind`s in the grammar.
5. **Nine-slice + screen-border `pattern: 'lattice'`.**
6. **Brass finish** (`finish`, `aTone`, scratches, banded light, glints).

## 8. Risks and notes
- **Dense thin lines in 3D:** strands at about 0.006 world width alias at a distance. Rely on the composer's MSAA and keep reeds at rank 3, so Intricacy drops them first. On `coarse` pointer devices, cap `density` at 0.6.
- **z-fighting** where layers cross: the z steps in §3.2 are larger than the rail depth (0.09 × layer factor). Assert in a test that a layer's z gap is greater than the rail half-depth.
- **Fidelity is a style, not a trace.** `spooner-medallion` matches the tutorial's proportions and layer structure. It does not copy the drawing point for point, which also keeps us clear of the copyright.
- No sandbox browser. Every record ends "type-checks, tests pass, builds; visual verification pending". The user's eye against the PDF is the acceptance test for phases 2 and 6.

## 9. Relation to ADDENDUM-020
ADDENDUM-020's lucky-draw frame (§3.7 there) should default to the `lattice` source once this lands. The two plans share only `src/shared/lib/random.ts`.

## 10. Verification
- `npx tsc --noEmit`, `npm test`, `npm run build` all green.
- User browser check: `npm run dev`, then:
  - Frame Studio, pick **Deco Lattice**: step through levels 1–4, reroll the seed, and sweep Intricacy from Minimal to Baroque.
  - Switch the surface to the screen border and choose the lattice pattern.
  - Open a `DecoLatticeFrame` medallion. Compare it with the tutorial's final render (PDF page 25) for: octilinear bundles, the octagram centre, corner diamonds, reed rows, and the brass finish.
