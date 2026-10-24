# 0004 — One-sheet poster frame as a selectable frame family

- Date: 2026-10-23
- Status: Proposed (this document); outcome appended in the same change-set
- Related spec: FDS §4.4 `FrameSpec`, §8.2 archetypes; Addenda 0002 (intricacy), 0003 (base genome)
- Supersedes: nothing. Adds a second frame family; the existing one stays the default.

## Process note

The sandbox restore removed `.git` a second time; all files survived. History was re-baselined as `fa76020` after `tsc` and the full suite (33 tests, including both preservation contracts) passed. Hashes cited in 0001–0003 refer to lost history.

## Question answered: is the poster frame mathematically derived or authored?

**Authored by designers, but constructed by rule.** Both halves of that sentence matter.

Credits (from the research already recorded in the FDS §1.5): the campaign artwork is by **Concept Arts** with Warner Bros; the GATSBY logotype and the bespoke Deco Pinstripe alphabet by **Like Minded Studio**; the interlocking GG monogram by **Bazmark with Tiffany & Co.**; background illustration by **Bazmark and Deva Studios**. No construction grid for the poster border has been published as far as this research found, so the decomposition below is my reconstruction from the artwork, not a disclosed method.

What the artwork shows, reading it zone by zone:

| Zone | What is drawn | Construction rule it obeys |
|---|---|---|
| Upper corners | Two large quarter-round fans; straight ribs radiating from a corner origin, crossed by concentric arcs, forming a polar grid | Equal angular division between two bounding angles; arcs at equal radial increments |
| Top centre | A circular medallion carrying the GG monogram, flanked by stepped blocks | Concentric circles; bilateral symmetry |
| Left and right edges | Bundles of parallel vertical lines of alternating weight running the full height — fluted/reeded pilasters | Constant pitch; stroke weights drawn from a small discrete set; graduated inset |
| Centre | The photographic window inside nested rectangular rules with stepped corners | Nested rectangles; corner setbacks in equal steps |
| Title block | Horizontal rules separating cast, logotype, date and billing | Rules at fixed y, symmetric about the centreline |
| Bottom | Vertical bars of graduated height forming a stepped skyline silhouette | Arithmetic (or near-arithmetic) progression of heights; mirrored about the centre |

Everything is **mirror-symmetric about the vertical centreline**, every curve is a circular arc, every straight run is axis-aligned or at 45°, and the stroke weights form a small discrete set. That is ruler-and-compass Art Deco: a human chose the proportions, but nothing in the border requires a freehand curve.

So the honest answer is the same one that applied to our own base frame before Addendum 0003: **authored in intent, parametric in structure** — which is exactly why it can be added as a generative family rather than traced as a literal path list.

## What our vocabulary is missing

Four motifs in the poster have no equivalent in the current engine:

1. **Radial fan with concentric arcs.** Our `sunburst` emits rays from a point plus a single base arch. The poster fan is a *polar grid*: ribs crossed by several arcs, anchored at a corner rather than centred on an axis.
2. **Fluted pilaster.** A bundle of parallel vertical rails with alternating weights and graduated length. We have no column motif; Act I's "side columns" are three hand-placed literal paths.
3. **Skyline comb.** Graduated vertical teeth forming a stepped silhouette. Nothing in the current set produces a profile.
4. **Ring.** A true circle. Our only closed form is a 4-point diamond.

## Decision

Add a **frame family** axis, orthogonal to the two existing axes:

```
Frame(act, textWidth, F, G, I) = Ornament_I( Base_G( Recipe_F,act(textWidth) ) )
```

- `F = 'sequence'` (default) — the title-sequence architecture. **Byte-identical to today.**
- `F = 'poster'` — a new recipe set per act, built from the four new motifs plus the existing vocabulary, laid out as a one-sheet border: fan crown, medallion, fluted pilasters, stepped aperture, skyline base.

The genome `G` continues to apply, so the poster family is itself tunable rather than a single fixed look:

| Gene | Effect on poster motifs |
|---|---|
| cornerScale, cornerProfile, zigguratSteps | aperture surround and stepped brackets (existing motifs, unchanged) |
| rayDensity, raySpread, rayReach | fan rib count, fan opening, fan radius |
| wingDelta | flutes per pilaster and teeth per comb |
| wingSweep | comb tooth height |
| fractalDepth, fractalRatio | ruler refinement of fan ribs; recursive sub-teeth on the comb; H-trees on poster diamonds; Cantor dashes on poster rules |

## Motif families (normative)

1. **Radial fan** `RF(cx, cy, r0, r1, ribs, θ0, θ1, arcs)`. Ribs at `θ_i = θ0 + i(θ1 − θ0)/(ribs − 1)`, each a segment from `r0` to `r1`. Arcs at `r_j = r0 + j(r1 − r0)/arcs`, each polyline-sampled over `[θ0, θ1]` at 2° or finer. Genome: `ribs' = max(3, round(ribs·ρ))`; the angular span is scaled about its midpoint by `σ` and clamped into the quadrant; `r1' = r0 + (r1 − r0)·λ`. Ruler refinement inserts ribs at dyadic angles with length `r0 + (r1' − r0)·r^ℓ`, `ℓ = d − v₂(k)`, skipping anything under the minimum feature size. Emitted as a mirrored pair, so a fan is always specified for the right-hand corner and reflected.
2. **Fluted pilaster** `FP(x0, pitch, count, yTop, yBottom, taper)`. Flute `i` sits at `x = x0 + i·pitch`, spans `[yBottom + i·taper, yTop − i·taper]`, carries width `w·(i even ? 1 : 0.55)` (the alternating heavy/light reeding), and recedes `z − 0.06i`. `count' = clamp(count + Δw, 2, 9)`. Mirrored.
3. **Skyline comb** `SC(yBase, teeth, pitch, x0, hMin, hMax, direction)`. Tooth `i` has height `hMin + (hMax − hMin)·(1 − i/(teeth − 1))²` — a squared falloff, which reads as a stepped pyramid rather than a straight ramp — scaled by `ω`. `teeth' = clamp(teeth + Δw, 2, 12)`. Mirrored pairs only, no centre tooth, so parting stays symmetric. At `d ≥ 1` each tooth gains a half-height sub-tooth at `pitch/2`, recursively, bounded by the minimum feature size.
4. **Ring** `R(cx, cy, radius, segments)`. Emitted as **two half-arcs** (right and left), not one closed circle, so the draw-on grows symmetrically from the top and the theatrical gate parts cleanly. `segments` even.

## Poster recipes

Each act gets a poster recipe with the same five zones, scaled to that act's aperture:

- Aperture: three nested stepped rectangles; the innermost is `role: primary`.
- Crown: twin corner fans plus a centred ring medallion (Act I additionally keeps its literal GG paths, `role: monogram`).
- Pilasters: fluted bundles on both edges.
- Rules: split rules above and below the title band.
- Base: skyline comb pointing down.

## Preservation guarantee

1. `F = 'sequence'` must keep the existing signature fixture and all 45 intricacy fingerprints passing, untouched.
2. A test must assert that passing `family: 'sequence'` explicitly is byte-identical to omitting it, at several intricacies, so the default path cannot silently diverge.
3. The poster family must satisfy every invariant the sequence family does: mirror symmetry (excluding `monogram`), determinism, budgets, well-formed rails, clamping.

## Surfaces

| Surface | Behaviour | Test id |
|---|---|---|
| Architecture tab → frame type | Two buttons, `Title Sequence` (default) and `One-Sheet Poster`; switching rebuilds all five cards | `architecture__family-sequence`, `architecture__family-poster` |
| Everything else | Unchanged; genome sliders, presets, variant explorer and the Ornament tab apply to whichever family is selected | — |

Reset-to-original returns family to `sequence` along with `G₀` and `I = 0.50`.

## Risks

- **Rail count.** Fans, flutes and combs are line-dense. Mitigation: per-card budgets already enforced (base ≤ 720, total ≤ 1 200, vertices ≤ 60 000) and asserted for the poster family at the extremes; measurements recorded in the outcome.
- **Vertical envelope.** A crown plus a base makes the poster family taller than the sequence family. Mitigation: the camera pull-back term added in 0003 already keys off `baseExtentY`, so richer families pull the camera back automatically.
- **Text collision.** The aperture is derived from the title width exactly as the sequence recipes are.

## Verification plan

| Layer | Check |
|---|---|
| Unit | sequence family unchanged (fixture, 45 fingerprints, explicit-vs-default equality); poster symmetry across presets, extremes and variants; determinism; budgets; fan/flute/comb/ring motif laws; genome responsiveness within the poster family; ring half-arc endpoints meet |
| Typecheck / build | `npx tsc --noEmit`; `npm run build` |
| Browser | Poster family at several genomes and intricacies, 16:9 and 4:3, orbit inspection — **outstanding in sandbox** |

## Rollback

Revert the implementation commit. The family axis is additive and defaults to `sequence`; no persisted user data exists.

---

## Outcome (implementation, same change-set)

**Status: Accepted and implemented** on 2026-10-23. Commits: `fa76020` re-baseline → `bba9e16` plan (docs only) → implementation commit.

### Modules

| Module | Role | LOC |
|---|---|---|
| `frame/motifs.ts` | +4 motif types: `radialFan`, `flutedPilaster`, `skylineComb`, `ring` | 125 |
| `frame/posterMotifs.ts` | Emitters, all built on `mirroredPair`, plus fan ruler refinement and comb sub-teeth | 266 |
| `frame/posterRecipes.ts` | Per-act layouts and the five zone builders | 163 |
| `frame/interpret.ts` | Dispatches on family; exhaustive switch over the extended union | 80 |
| `frame/types.ts`, `derive.ts`, `index.ts` | `FrameFamily` threaded through style, request and barrel | — |
| `GatsbySceneManager.ts`, `useFrameStyle.ts`, `ArchitecturePanel.tsx`, `frameGenomeUi.ts` | Family state, `setFamily`, selector UI and copy | — |

### Preservation

- The signature fixture and all 45 intricacy fingerprints pass **unmodified**; neither contract file was touched.
- A new test asserts `family: 'sequence'` stated explicitly is byte-identical to omitting it, for five acts × five intricacies.
- A companion test asserts the poster family is genuinely different for every act, so the selector cannot silently no-op.

### Measured (aggregate of five cards, width 5.4)

| Family | Genome | I | Rails | Vertices | Fractal | Extent x × y | Base y | Extra pull-back |
|---|---|---|---|---|---|---|---|---|
| sequence | G₀ | 0.5 | 197 | 5 244 | 0 | 6.90 × 4.68 | 4.68 | 0.00 |
| sequence | G₀ | 1.0 | 1 149 | 27 156 | 0 | 8.20 × 5.81 | 4.68 | 0.88 |
| poster | G₀ | 0.5 | 335 | 8 892 | 0 | 5.54 × 4.25 | 4.25 | 0.00 |
| poster | G₀ | 1.0 | 2 131 | 48 036 | 0 | 7.48 × 5.74 | 4.25 | 0.09 |
| poster | Filigree | 0.5 | 1 493 | 22 968 | 1 178 | 5.62 × 4.25 | 4.25 | 0.00 |
| poster | Filigree | 1.0 | 3 113 | 60 720 | 1 178 | 7.59 × 5.74 | 4.25 | 0.21 |

Budgets are per card, not per scene: the worst single card across both families, all six presets and variants 1–30 at `I = 1` is **808 rails (cap 1 200)** and **16 584 vertices (cap 60 000)**. The poster family is denser than the sequence family at the signature (335 vs 197 rails — flutes, fan grids and combs are line-rich) but **narrower and shorter** (5.54 × 4.25 against 6.90 × 4.68), so it needs no extra camera pull-back at `G₀`. Heaviest regeneration measured: 7.88 ms of Node CPU for all five cards (poster + Filigree + `I = 1`), comparable to the sequence family's 7.53 ms. GPU upload not measured.

### Defect found and fixed during implementation

`cos(π/2)` evaluates to ~6.1 × 10⁻¹⁷, so the ring's two half-arcs did not share exact pole coordinates, and `mirrorSpec` produced `-0` for mirrored zeros. Invisible on screen, but it is a hairline seam in the data and negative zeros in vertex buffers. Fixed at the source with a `snapZero` helper in the emitter and the mirror, rather than loosened in the test; the test now asserts exact pole coincidence between the two halves.

### Deviations from the plan

1. **`withRole` now preserves a spec's own role** instead of overwriting it. Poster motifs tag their own recursive children `fractal`, and the GG paths arrive pre-tagged `monogram`; without this the medallion signet would have been simplified away at low intricacy.
2. **Comb teeth use a squared falloff** (as planned) and are emitted without a centre tooth, so every tooth has a mirror partner and the gate parts symmetrically.
3. **Fan sweep is clamped to 0.62π half-span** so a wide `raySpread` cannot rotate a corner fan past the vertical and collide with the opposite pilaster.

### Verification

- `npx tsc --noEmit`: **PASS**.
- `npm test`: **PASS — 47 tests** in 5 files (14 new: 2 family-preservation, 6 poster invariants, 6 motif laws).
- `npm run build`: **PASS** — `dist/index.html` 918.40 kB (gzip 245.62 kB).
- All touched files ≤ 800 LOC.
- **Outstanding:** browser/WebGL visual review of the poster family across genomes and intricacies at 16:9 and 4:3, and orbit inspection. No browser in this sandbox; not claimed.
