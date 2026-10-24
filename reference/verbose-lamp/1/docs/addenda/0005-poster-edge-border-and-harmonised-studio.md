# 0005 — Poster edge border, and a harmonised Frame Studio

- Date: 2026-10-23
- Status: Proposed (this document); outcome appended in the same change-set
- Related spec: FDS §4.4, §7 surfaces, §8.2; Addenda 0002, 0003, 0004
- Supersedes: the surface layout of 0004 (the *label* "One-Sheet Poster" as a title-frame type) and the parallel preset/variant mechanisms of 0003

## Process note

`.git` was cleared again by the sandbox restore. Files survived and were re-baselined as `f062a34` after `tsc` and the full 47-test suite passed. Hashes in 0001–0004 refer to lost history.

## Correction to 0004

I misread the request. The user pointed at the border **around the edge of the poster sheet**; I built a *title-frame style* borrowed from poster motifs and labelled it "One-Sheet Poster". Those are different objects:

| | Title frame | Poster edge border |
|---|---|---|
| Where it sits | Around each title card, inside the scene | Around the **viewport edge**, on top of everything |
| Does it move | No — fixed at the card's depth | No — fixed relative to the **camera**, so it stays at the screen edge while the camera flies |
| How many | Five (one per act) | One, persistent |
| Reads as | Title typography framing | The printed sheet's proscenium |

A title-frame style can never become an edge border, because the border's defining property is that it does not belong to any card. It must be a separate renderable.

## The poster's edge border, decomposed

Reading the outermost border of the artwork, outside the photographic window:

1. **Nested rules.** Three or four concentric rectangular rules of alternating weight, the outermost pair close together, with **stepped corners** — small right-angle setbacks, not mitres or chamfers.
2. **Corner fans.** In the upper corners especially: straight ribs radiating from a point at the corner, crossed by **concentric arcs**, forming a quarter-circle polar grid. Mirrored in all four corners.
3. **Reeding.** Along the straight runs, dense parallel ticks perpendicular to the edge, alternating heavy and light, thinning toward the corners.
4. **Inner hairline.** A fine final rule separating the border from the image area.

Same grammar as before — equal angular division, concentric arcs, constant pitch, discrete weights, strict mirror symmetry in **both** axes — so it is authored in intent and parametric in structure, and can be generated.

## Second problem: the tuneables are incoherent

Framed from the user's point of view, the current panel asks them to understand four mechanisms to change one thing:

| Mechanism | What it really is | Problem |
|---|---|---|
| "Frame type: Title Sequence / One-Sheet Poster" | Two **motif vocabularies** for the *same* title frame | Named after media, so it sounds like two different products. Neither produces a border. |
| 6 named presets | Hand-picked genome values | Redundant with the explorer below |
| Variant explorer (#0…) | Algorithmically picked genome values | A second, overlapping list of the same kind of thing |
| 10 gene sliders | The underlying parameters | Fine, but presented as a third parallel way to do the same job |

Two named lists that both set ten numbers, plus a medium-named type selector, is three routes to one destination.

## Decision

### A harmonised model: three orthogonal controls, one mechanism each

```
Title frame   = Style → Design → Fine-tune → Ornament density
Screen border = On/Off → Weight
```

1. **What is decorated** becomes explicit and separate:
   - **Title frame** — the golden frame around each of the five title cards (already exists).
   - **Screen border** — a new persistent proscenium at the viewport edge, reconstructed from the poster's outer border. Off by default; the original experience is unchanged.
2. **Style** replaces "Frame type", and is named by what it draws rather than by medium:
   - **Sunburst** (was "Title Sequence"): octagon plate, stepped ziggurats, Chrysler sunbursts, chevrons.
   - **Fluted** (was "One-Sheet Poster"): corner fans, fluted pilasters, skyline comb, rings.
   Both are title-frame vocabularies; both are full tunable spaces.
3. **Design** is **one merged gallery** replacing presets *and* the variant explorer: entry 0 is the original; then the named designs; then numbered variations. Prev/next steps this single list, selecting an entry applies it, and touching a fine-tune slider relabels it "Custom". One list, one set of arrows.
4. **Fine-tune** (the 10 genes) moves under an explicit disclosure, so the default path is Style → Design → Ornament, and the sliders are opt-in depth rather than a competing surface.
5. **Ornament** keeps its meaning exactly (Addendum 0002 intricacy) and stays a single slider.

### Screen border construction (pure, screen-space)

Built in unit viewport coordinates — `y ∈ [-1, 1]`, `x ∈ [-aspect, aspect]` — then attached to the camera at a fixed distance and scaled by `distance × tan(fov/2)`, so it hugs the viewport edge through the whole fly-through and never belongs to a card.

- **Nested rules** (`1 + round(3·density)` of them): stepped ziggurat rectangles at increasing insets, outermost heaviest.
- **Corner fans**: one quarter-grid per corner (ribs + concentric arcs), generated once and reflected into all four corners.
- **Reeding**: perpendicular ticks along each straight run, alternating heavy/light, thinned toward the corners, count driven by density and the wing-count gene.
- **Inner hairline**: a fine final rule.
- Genome genes apply (corner size, setback stairs, ray density/spread/reach, recursion) so the border is a tunable space too; recursion refines fan ribs and adds sub-teeth to reeding.

Preservation is unaffected: the border is a new object that is **off by default**, so `npm test` at baseline must pass with no changes to any contract file.

### Surfaces

| Surface | Test id |
|---|---|
| Title frame section | `frame-studio__section-title` |
| Style: Sunburst / Fluted | `architecture__style-sequence`, `architecture__style-poster` |
| Design gallery: prev / label / next | `architecture__design-prev`, `architecture__design-label`, `architecture__design-next` |
| Fine-tune disclosure | `architecture__fine-tune-toggle`, `architecture__fine-tune` |
| Ornament slider | `frame-studio__intricacy-slider` |
| Screen border section | `frame-studio__section-border` |
| Border enable / weight | `border__enable`, `border__weight` |
| Reset to original (both) / Done | `frame-studio__reset-all-button`, `frame-studio__done-button` |

## Risks

- **Border must not disturb the sequence.** It is a separate mesh parented to the camera; the five card rigs are untouched, so the two preservation contracts cannot regress.
- **Aspect changes.** Border geometry is rebuilt on resize; asserted for 16:9 and 4:3.
- **Vertex cost.** Fans and reeding are line-dense; density is capped and budgets are asserted.

## Verification plan

| Layer | Check |
|---|---|
| Unit | All 47 existing tests pass unmodified; border symmetry in **x and y**; all points inside `[-aspect, aspect] × [-1, 1]`; determinism; monotone in density; responds to genome groups; budgets at extremes and both aspects; camera-space scale maths |
| Typecheck / build | `npx tsc --noEmit`; `npm run build` |
| Browser | Border at both aspects and several densities; confirm it stays pinned during the fly-through — **outstanding in sandbox** |

## Rollback

Revert the implementation commit. The border is additive and off by default; the harmonised UI is a reorganisation of existing controls with no persisted user data.

---

## Outcome (implementation, same change-set)

**Status: Accepted and implemented** on 2026-10-23. Commits: `f062a34` re-baseline → `7ea618a` plan (docs only) → implementation commit.

### Modules

| Module | Role | LOC |
|---|---|---|
| `frame/edgeBorder.ts` | Pure border geometry in unit viewport space: nested stepped rules, four corner fans, reeding, inner hairline | 293 |
| `edgeBorderRig.ts` | Camera-parented mesh, frustum scaling, geometry hot-swap, fade-in | 152 |
| `frameGenomeUi.ts` | `FRAME_STYLES` (Sunburst/Fluted) and one merged `DESIGN_GALLERY` | 214 |
| `TitleFramePanel.tsx` | Style → Design → Ornament → opt-in Fine-tune | 203 |
| `ScreenBorderPanel.tsx` | Border toggle and weight | 68 |
| `FrameStudioModal.tsx` | Two labelled sections, shared readout, one reset | 115 |
| `useFrameStyle.ts` | Style, design index and border state; pushes to the manager | 146 |
| `GatsbySceneManager.ts` | Owns the rig, rebuilds on resize, disposes cleanly | 723 |

### The border is a separate object, as required

Attached to the camera at 3 units, scaled by `distance × tan(fov/2)` = 1.1516 at the 42° field of view, so `y = ±1` lands exactly on the viewport edge. It is **off by default**, belongs to no card, and survives the whole fly-through. The five card rigs are untouched, so both preservation contracts pass without modification.

### Measured

| Genome | Weight | Rails | Vertices |
|---|---|---|---|
| Signature | 0.0 | 75 | 632 |
| Signature | 0.5 | 143 | 984 |
| Signature | 1.0 | 209 | 1 288 |
| Filigree | 1.0 | 389 | 2 008 |

Worst case across 26 genomes × 3 weights × 2 aspects: **405 rails, 2 112 vertices** — a third of a single card's budget, and it is one object rather than five.

### Three defects found and fixed by the new tests

1. **The left and right edges had no reeding at all.** Their span was computed against the half-height while the clearance test expected the half-width, so every side tick was skipped. Top and bottom were reeded, sides were bare. Rewritten so one run is generated and reflected into all four edges.
2. **The corner fan swept past its quadrant.** With `raySpread > 1` the fan wrapped past the bottom of the poster and out through the right edge, putting geometry outside the viewport (`|x| = 1.853` against 1.778). A corner fan now keeps its 90° sweep: a wider `raySpread` adds ribs, not sweep.
3. **The inner hairline carried a redundant duplicate closing point.** A closed path does not need its first point repeated, and the repeat defeated canonicalisation. Now emitted as a true 4-point closed path.

Two further test-side corrections, recorded so nobody re-introduces them: closed paths need canonical start handling (as in Addendum 0003), and border rails are **undirected**, so reflection-invariance holds only up to traversal direction. Both comparisons now canonicalise through the shared test kit.

### Harmonisation, as shipped

| Before | After |
|---|---|
| "Frame type: Title Sequence / One-Sheet Poster" | **Style: Sunburst / Fluted**, each labelled with the four motifs it draws |
| 6 presets **and** an open-ended variant explorer | **One Design gallery**: Original (0), the named designs, then numbered variations, stepped with one pair of arrows |
| 10 sliders presented as a third parallel route | **Fine-tune proportions**, behind a disclosure; touching one relabels the design "Custom" |
| Ornament as a separate tab | **Ornament density** slider in the same panel (meaning unchanged from 0002) |
| — | **Screen border** section: toggle plus weight slider, off by default |

Reset to original returns style, design, density *and* border.

### Verification

- `npx tsc --noEmit`: **PASS**.
- `npm test`: **PASS — 57 tests** in 6 files (10 new for the border; all 47 prior contracts unmodified).
- `npm run build`: **PASS** — single-file `dist/index.html`.
- All touched files ≤ 800 LOC (largest `GatsbySceneManager.ts`, 723).
- **Outstanding:** browser review — whether the border reads as the poster's edge at both aspects, that it stays pinned through the fly-through, and that the harmonised panel is actually clearer to use. No browser in this sandbox; not claimed.
