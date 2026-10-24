# 0003 — Tunable base architecture: motif genome and recursive (fractal) rules

- Date: 2026-10-23
- Status: Proposed (this document); outcome is appended in the same change-set
- Related spec: FDS §4.4 `FrameSpec`, §6.3 frame-width derivation, §8.2 archetypes; Addendum 0002
- Supersedes: parts of 0002 (rail cap, budget clamp strategy, deviation 3) — listed below

## Process note: repository history

The sandbox restore removed `.git`; all files survived. History was re-baselined as `741dec2` after `tsc` and the full test suite (including the signature contract) passed on the surviving tree. Earlier hashes cited in 0001/0002 (`8884bf7`, `f746451`, `8c4be96`) refer to the lost history and are kept as historical references.

## Question answered: how is the base frame generated, and is it a fractal?

**It is not a fractal.** The base frame is a *hand-composed parametric shape grammar*:

1. Each act has a recipe: an ordered list of 18–70 rails (measured) built from six closed-form Art Deco motifs — cut-corner octagon, stepped ziggurat, diamond, sunburst fan, split rule, chevron wings — plus a few literal paths (the GG letters, the hero keystone, columns, bars and spears).
2. Every number in a recipe (for example a 0.72 corner cut, 11 rays, a 0.76π fan, 4 wings) was chosen by eye. Only the frame half-width adapts, to enclose the title: `hw = max(min, textWidth × k + margin)`.
3. Symmetry comes from each motif emitting mirrored halves; depth comes from z-plane assignments; choreography comes from per-rail delays.
4. There is **no recursive rule**. The only self-similarity is hand-placed concentric nesting (2–4 copies of one outline) and, since 0002, echo layers (one affine map applied up to four times). Zooming into the frame reveals no new structure, so it has no fractal character.

Measured signature envelope at width 5.4: rails 45 / 20 / 44 / 18 / 70 (Acts I–V); max |x| 6.90; max |y| 4.68 (hero crown), independent of title width.

## Decision

Lift the hand-chosen constants into a typed **base genome** `G`, express each act as a declarative **recipe** of named motifs, and generalise each motif into a **parametric family** in which the original constant is one specific parameter value. Add three genuinely **recursive rules** (H-tree diamonds, ruler-function sunbursts, Cantor rules) that are inert at depth 0.

```
Frame(act, textWidth, G, I) = Ornament_I( Base_G( Recipe_act(textWidth) ) )
```

Two orthogonal axes: `G` decides *what the architecture is*; intricacy `I` (0002) decides *how much ornament is layered on it*. The original frame is the point `(G₀, I = 0.50)`.

## Options considered

- **A. A menu of extra hand-authored base designs.** Predictable, but each design is another frozen literal list, nothing is continuous, and it does not answer "make it mathematical". Rejected.
- **B. Genome over generalised motif families + recursive rules (chosen).** Every slider is continuous or integral and meaningful; the signature is provably one point; the recursive rules make fractal depth a real parameter.
- **C. Full L-system / shape-grammar rewrite of every act.** Most expressive, but it would re-author the signature rather than contain it, which puts preservation at risk and is out of proportion to the request. Rejected.

## Genome (normative)

| Gene | Symbol | Slider range | Signature `G₀` | Kind | Acts on |
|---|---|---|---|---|---|
| cornerScale | κ | 0.50–1.80 | 1.00 | continuous | octagon cut, ziggurat step |
| cornerProfile | p | −1.00–1.00 | 0.00 | continuous | octagon corners: concave ← chamfer → convex |
| zigguratSteps | n | 1–5 | 2 | integer | stairs per ziggurat corner |
| rayDensity | ρ | 0.50–1.60 | 1.00 | continuous | sunburst ray count |
| raySpread | σ | 0.75–1.20 | 1.00 | continuous | sunburst opening angle |
| rayReach | λ | 0.75–1.35 | 1.00 | continuous | sunburst ray length |
| wingDelta | Δw | −3–+2 | 0 | integer | chevron wing count |
| wingSweep | ω | 0.60–1.60 | 1.00 | continuous | chevron depth |
| fractalDepth | d | 0–3 | 0 | integer | recursion depth of all three rules |
| fractalRatio | r | 0.30–0.60 | 0.45 | continuous | scale per recursion level (inert when d = 0) |

`clampGenome` fills missing genes from `G₀`, clamps to range, rounds integer genes and maps non-finite input to `G₀`. A genome is *geometrically signature* when every active gene equals `G₀`; `r` is ignored when `d = 0`.

## Motif families (normative)

1. **Cut octagon** `O(hw, hh, c; κ, p)`: `c' = min(κc, 0.45hw, 0.45hh)`. `p = 0` emits the original chamfer. `p ≠ 0` replaces each chamfer with a quadratic Bézier `B(t) = (1−t)²P₀ + 2t(1−t)C + t²P₂`, `C = M + |p|(T − M)`, `M` the chamfer midpoint, `T` the outer corner for `p > 0` (Streamline rounding) or the inner corner `(hw − c', hh − c')` for `p < 0` (Deco notch); five interior samples.
2. **Ziggurat** `Z(hw, hh, s; κ, n)`: `s' = κ·s·2/n`; `n` stairs per corner, `4n + 4` points per half; total corner inset `2κs` is independent of `n`. `n = 2, κ = 1` reproduces the original twelve points.
3. **Sunburst** `F(N, spread, outer; ρ, σ, λ, d, r)`: `N' = 1 + 2·round(ρ(N − 1)/2)` (always odd, so the axial ray survives); `spread' = min(σ·spread, 0.95π)`; `outer' = λ·outer`. **Ruler refinement:** the fan gets `(N' − 1)·2^d + 1` angular slots; a slot `k` that is not a base ray has level `ℓ = d − v₂(k)` (`v₂` = 2-adic valuation) and radial length `(outer'(θ) − inner)·r^ℓ` beyond the inner arch. Rays shorter than `ε = 0.06` are not emitted. This is the self-similar ruler sequence.
4. **Diamond** `D(cx, cy, rx, ry; d, r)`: **H-tree.** Level 1 places two children tip-to-tip on the major axis; each level alternates axes; child radii are `r×` the parent; centre offset `(1 + r)·R` along the axis. At most `2^{d+1} − 2` children; children with max radius `< 0.03` are not emitted.
5. **Split rule** `S(a, b; d, r)`: **Cantor rule.** `[a, b] → [a, a + r|I|] ∪ [b − r|I|, b]`, applied `d` times: `2^d` segments with total length `(2r)^d·|I|`. The limit set has Hausdorff dimension `log 2 / log(1/r)` (0.868 at `r = 0.45`; the classic 0.631 at `r = 1/3`). Segments shorter than `0.05` are not split further.
6. **Chevron wings** `W(count, wingW; Δw, ω)`: `count' = clamp(count + Δw, 1, 6)`, `wingW' = ω·wingW`.
7. **Literal paths** are genome-invariant: the GG letters, keystone and spears are brand identity.

Roles become explicit: recipes declare `primary` and `monogram`; recursive children are `fractal` (simplifiable by 0002's salience gate; never echoed or banded).

## Variant explorer (normative)

Variant `#0` is `G₀`. Variant `#k` (k ≥ 1) maps the R-sequence point `u_j(k) = frac(0.5 + k·α_j)`, `α_j = φ^{−(j+1)}`, with `φ` the positive root of `x^{11} = x + 1` (≈ 1.068), into each gene's explore range (narrower than the slider range, so variants stay legible). Deterministic, reproducible, and evenly spread in ten dimensions without a random number generator.

Explore ranges: κ 0.75–1.50, p −0.9–0.9, n 1–4, ρ 0.6–1.5, σ 0.85–1.15, λ 0.85–1.25, Δw −2–+2, ω 0.7–1.4, d 0–3, r 0.35–0.55.

Presets: Signature (`G₀`), Skyscraper, Moderne, Jazz Fan, Cathedral, Filigree.

## Preservation guarantee (hard requirement)

1. `Base(G₀)` must deep-equal the existing signature fixture (generated from the original pre-refactor builder).
2. **Before** refactoring, freeze SHA-256 fingerprints of the whole current intricacy family (five acts × nine intricacy values) from the untouched engine, in a separate commit. After refactoring, `G₀` must reproduce every fingerprint, so the tunable the user already approved is unchanged too.
3. Camera: a new vertical pull-back term uses only the *base* vertical extent above `SAFE_FRAME_EXTENT_Y = 4.70` (signature max 4.68). For `G₀` the camera is therefore identical at every intricacy.

## Changes superseding 0002

| 0002 statement | 0003 replacement | Reason |
|---|---|---|
| Rails per card ≤ 480 | ≤ 1 200; vertices ≤ 60 000 unchanged; base ≤ 720 | Fractal rays are cheap (12 vertices each); the vertex cap is the GPU-meaningful one |
| Budget clamp truncates trailing mirrored pairs | Reduce whole derived families: echo layers → rosette rings → band pairs; never truncate the base | Sunburst rays are not emitted in mirror pairs, so pair truncation could break symmetry once budgets are reachable |
| Deviation 3: slider rebuilds whole rigs (text included) | Frame-only geometry hot-swap; text rigs and material persist | Ten sliders make rebuild cost user-visible; avoids glyph re-rasterisation and shader recompiles |

## Surfaces

| Surface | Behaviour | Test id |
|---|---|---|
| Frame Studio tabs | `Ornament` (0002) and `Architecture` (new) | `frame-studio__tab-{ornament,architecture}` |
| Gene sliders | Grouped Corners / Sunbursts / Wings / Recursion, value readout, signature marker | `architecture__gene-{key}` |
| Base presets | Six named genomes | `architecture__preset-{id}` |
| Variant explorer | Previous / next / signature; label `Variant #k` or `Custom` | `architecture__variant-{prev,next,signature}` |
| Reset | Base reset in panel; footer resets both axes | `architecture__reset-button`, `frame-studio__reset-all-button` |

## Verification plan

| Layer | Check |
|---|---|
| Unit | `Base(G₀)` = fixture; `G₀` reproduces all pre-refactor intricacy fingerprints; `clampGenome` contract; inert `r` at `d = 0`; every active gene changes geometry; x-symmetry for presets, 40 variants and range extremes; determinism; base/total/vertex budgets; ziggurat point law `4n + 4`; odd ray counts with the axial ray kept; Cantor total length `(2r)^d·|I|`; H-tree child radius `r×` parent; fractal count monotone in `d`; explorer `#0 = G₀`, distinct in-range variants; presets valid; signature vertical extent ≤ 4.70; stats aggregation |
| Typecheck / build | `npx tsc --noEmit`; `npm run build` single file |
| Browser | Visual check of presets, variants and fractal depth at 16:9 and 4:3 — **outstanding in sandbox** |

Risks: recursion explosion (bounded by minimum feature sizes and the base cap test); recipe transcription error (caught by fixture equality); text collision from larger corners (κ only moves corners inward; reach and sweep only grow outward and trigger pull-back).

## Rollback

Revert the implementation commit; the characterization commit and fixture stay valid. No persisted user data exists.

---

## Outcome (implementation, same change-set)

**Status: Accepted and implemented** on 2026-10-23. Commit sequence: `d94139a` plan (docs only) → `9f1ff73` characterization fingerprints generated from the untouched 0002 engine → implementation commit.

### Architecture as built

| Module | Role | LOC |
|---|---|---|
| `frame/genome.ts` | Genome type, definitions, clamp, signature test, R-sequence explorer | 187 |
| `frame/motifs.ts` | Declarative motif vocabulary (discriminated union) | 80 |
| `frame/recipes.ts` | Five act recipes transcribed from the retired `signatureArchetypes.ts` | 264 |
| `frame/primitives.ts` | Generalised families: octagon (κ, p), ziggurat (κ, n), diamond, sunburst (ρ, σ, λ), split rule, chevrons (Δw, ω) | 283 |
| `frame/fractals.ts` | H-tree diamonds, ruler sunbursts, Cantor rules, with minimum feature sizes | 178 |
| `frame/interpret.ts` | `Base_G(Recipe)`; tags `fractal` children | 61 |
| `frame/derive.ts` | Intricacy engine on top of the base; family-wise budget fitting | 323 |
| `frame/stats.ts` | Pure cross-card aggregation | 37 |
| `decoFrames.ts` | `applyFrameStyle` hot-swaps only the merged frame buffer | 465 |
| `GatsbySceneManager.ts` | `setFrameStyle` coalesced per frame; vertical pull-back term | 695 (was 761) |
| `post/cinemaNitrateShader.ts` | Moved verbatim out of the manager for LOC headroom | 66 |
| `hooks/useFrameStyle.ts` | Owns style state; components render only | 111 |
| `components/frame-studio/*` | Modal shell with tabs, Architecture panel, gene slider, Ornament panel | 413 |
| `data/frameGenomeUi.ts` | Presets, gene copy, formatting, readout rows | 158 |

### Preservation proof

1. The signature fixture (generated from the original builder) passed on the **first run** after the rewrite. The recipes plus generalised families reproduce the original rails exactly.
2. All 45 characterization fingerprints (5 acts × 9 intricacy values), committed in `9f1ff73` **before** the refactor, still match. The approved tunable is unchanged at `G₀`.
3. Explicitly passing `G₀` equals the default path at five intricacies. `r` is proven inert at `d = 0`. The signature's vertical base reach is ≤ 4.70 at widths 3.2/5.4/9.5, so the camera term is zero and framing is identical.

### Measured design space (aggregate of five cards, width 5.4)

| Preset | I | Rails | Vertices | Fractal rails | Extent x × y | Base y | Extra pull-back |
|---|---|---|---|---|---|---|---|
| Signature | 0.5 | 197 | 5 244 | 0 | 6.90 × 4.68 | 4.68 | 0.00 |
| Signature | 1.0 | 1 149 | 27 156 | 0 | 8.20 × 5.81 | 4.68 | 0.88 (unchanged from 0002) |
| Skyscraper | 0.5 | 185 | 5 892 | 0 | 6.90 × 5.03 | 5.03 | 0.86 |
| Moderne | 0.5 | 163 | 5 724 | 0 | 6.90 × 4.50 | 4.50 | 0.00 |
| Jazz Fan | 0.5 | 391 | 8 220 | 180 | 6.90 × 5.12 | 5.12 | 1.09 |
| Cathedral | 0.5 | 217 | 7 236 | 0 | 7.11 × 4.86 | 4.86 | 0.40 |
| Filigree | 0.5 | 1 157 | 21 012 | 966 | 6.90 × 4.86 | 4.86 | 0.40 |
| Filigree | 1.0 | 2 005 | 41 676 | 966 | 8.20 × 5.99 | 4.86 | 1.28 |

Per-card budgets hold for every preset, both extremes and explorer variants 1–40 (base ≤ 720, total ≤ 1 200, vertices ≤ 60 000), as asserted by tests. Engine regeneration of all five cards takes 0.95 ms (signature), 3.27 ms (variant #9 at I = 1) and 7.53 ms (Filigree at I = 1) of Node CPU time. GPU upload was not measured.

### Deviations from the plan

1. **Monogram roles are declared, not inferred.** Recipes tag the three GG paths `monogram` and each act's silhouette `primary`. The geometric inference from 0002 remains only as a fallback for untagged specs. Classification tests are unchanged and pass.
2. **Sunburst counts are clamped to ≥ 3 rays** (a guard never reached inside the slider range), so ruler refinement always has an interval to bisect.
3. **Shared test helpers** moved to `__tests__/frameTestKit.ts`; `intricacy.test.ts` now imports them instead of duplicating them (Greenfield duplicated-code rule).
4. **Variants are quantised to the slider grid**, so every explorer genome can be reproduced exactly with the sliders.

### Verification

- `npx tsc --noEmit`: **PASS**.
- `npm test`: **PASS — 33 tests** in 4 files: signature contract (2), intricacy-family characterization (1), intricacy invariants (8), base genome (22).
- `npm run build`: **PASS** — `dist/index.html` 910.41 kB (gzip 243.55 kB).
- Every touched file ≤ 800 LOC (largest: `GatsbySceneManager.ts` 695).
- **Outstanding:** browser/WebGL visual review of presets, variants and recursion depth at 16:9 and 4:3; frame hot-swap smoothness while dragging (no browser in this sandbox; not claimed).
