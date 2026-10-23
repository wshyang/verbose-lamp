# ADDENDUM-002 — Configurable frame intricacy: assessment and plan

**Date:** 2026-10-23  
**Relates to:** BUILD_PROMPT §3 (frame language), §4 (per-act construction),
§6 (objects/state), §7 (surfaces), §11 (acceptance)  
**Decision Context:** DC-003  
**Status:** Plan accepted; implementation recorded in ADDENDUM-003.

---

## 1. Assessment of the current construction

### How frames are produced today

`buildFrameSpecs(archetype, mainWidth)` in `src/webgl/decoFrames.ts` returns a flat
list of `PolylineSpec` (points, width, depth, z, delay, partDir). Each archetype is a
**hand-authored script** of helper calls (`addCutOctagon`, `addZigguratFrame`,
`addDiamond`, `addSunburstFan`, `addSplitRule`, `addChevronWings`) plus literal
polylines for the monogram. One `appendChamferedPolyline` pass turns every spec into a
six-facet beveled gold rail; one mesh, one material, one trim-reveal shader.

### What is already mathematical

- Rail cross-section, miter joins, normals.
- Trim reveal (`segU` vs eased `uDraw − delay`), molten tip, gate parting.
- Sunburst fans (ray length and delay are functions of angular offset).

### What is not — and why that blocks "intricacy"

| Gap | Consequence |
|---|---|
| Ring counts, ray counts, column counts, chevron counts are literals | No single knob can scale density |
| Specs carry no semantic tag (is this a frame ring? a rule? a ray?) | Nothing can decide *how* to elaborate or simplify an element |
| No notion of importance | Nothing can decide *what to remove* at low intricacy |
| `buildFrameSpecs` is ~330 lines in a 980-line file | Violates CLAUDE.md §6; untestable as a unit |
| Text and frame are built together in `createGatsbyCardRig` | Changing the frame would re-rasterise typography (~tens of ms × 5 cards) |

### Constraint that governs the design

**The current render must survive exactly.** It becomes the *baseline* point of the
range, and a geometry snapshot taken before the refactor is the proof.

---

## 2. Decision

Introduce a single user-tunable scalar, **intricacy `k ∈ [0, 1]`** (UI 0–100), and
derive every frame from a **three-stage mathematical grammar**:

```
core(archetype, width)  →  annotate(kind, rank)  →  reduce(k)  →  elaborate(k)
```

- `core` is the existing construction, moved verbatim (bodies moved, not rewritten).
- `annotate` attaches two derived fields to each spec: a **kind** (set by whichever
  helper produced it) and a **rank** (computed from kind and ordinal — not hand-tagged).
- `reduce` removes specs whose rank exceeds the budget at `k < 0.5`.
- `elaborate` applies kind-specific **production rules** `n(k)` times at `k > 0.5`.
- At **`k = 0.5` both stages are identities**, so the baseline is bit-identical to
  today's output. This is enforced by test.

### 2.1 Density function

```
D(k)  = 2^(2(k − 0.5))          ∈ [0.5, 2]      (doubles per half-step about baseline)
E(k)  = floor((k − 0.5) · 8)    for k > 0.5     → 0,1,2,3,4 elaboration generations
R(k)  = floor(k · 8)            for k < 0.5     → 0,1,2,3 rank budget
```

`D(k)` is reserved for future count scaling of fans/columns (odd-preserving for fans so
a centre ray always exists). The first implementation uses `E` and `R` only, because
they keep the baseline exact without touching helper signatures.

### 2.2 Kinds and ranks

| kind | produced by | rank rule |
|---|---|---|
| `frame` | octagon / ziggurat halves, hero keystone | first frame of the card = 0, every later frame = 1 |
| `monogram` | the two G letterforms | 0 |
| `rule` | split rules, hero wing bars, side rays | 1 |
| `diamond` | `addDiamond` | 2 |
| `column` | monogram side columns | 2 |
| `chevron` | `addChevronWings` | 2 |
| `ray`, `arch` | `addSunburstFan` | 3 |
| `pinstripe` | monogram inner G | 3 |

Rank is derived (`baseRank[kind] + min(1, ordinalOfKind)` for frames), never typed
by hand per call, so the rule is auditable in one table.

### 2.3 Production rules (applied generation `i = 1..E(k)`, per-kind cap)

| kind | rule | cap |
|---|---|---|
| `frame` | **Echo ring:** offset polyline outward by `d_i = 0.11 · 1.4^i` along miter normals; width `w·(i odd ? 0.38 : 0.60)`; `z = z₀ − 0.50 − 0.22 i`; `delay + 0.05 i`; partDir preserved. Outward is resolved by sign test against the centroid so halves still meet at `x = 0`. | 4 |
| `diamond` | **Nested:** concentric copy scaled `0.58^i`, width `0.8 w` | 3 |
| `rule` | **Guilloché twin:** parallel hairlines at `±0.07 i`, width `0.45 w` | 2 |
| `column` | **Shadow column:** copy at `x + sign·0.07 i`, `z − 0.1 i`, width `0.6 w` | 2 |
| `chevron` | **Nested chevron:** scaled toward apex by `0.72^i`, width `0.7 w` | 2 |
| `ray` | **Dash-dot tip:** collinear segment from `1.08·len` to `1.22·len`, width `0.7 w` | 1 |
| `arch`, `monogram`, `pinstripe` | none — letterform legibility and the fan's base arch are protected | 0 |

All rules are pure functions of the source spec and `i`; no randomness, so the frame
is deterministic for a given `(archetype, width, k)`.

### 2.4 Named presets (UI)

| Preset | k | Expected effect |
|---|---|---|
| Minimal | 0.00 | Primary frame + monogram + rules only |
| Restrained | 0.25 | + secondary rings, diamonds, columns, chevrons |
| **Film Baseline** | **0.50** | **Identical to today** |
| Ornate | 0.75 | + 2 echo generations, nested diamonds, guilloché |
| Baroque | 1.00 | + 4 echo generations, full elaboration |

---

## 3. Plan (ordered, each step independently committable)

1. **Freeze the golden.** Add Vitest; export the current builder; snapshot its output
   for all five archetypes at a fixed width. Commit. *(no behaviour change)*
2. **Extract the pure grammar.** Move spec types, helpers and `buildFrameSpecs` to
   `src/webgl/frameGrammar/` (`types.ts`, `primitives.ts`, `archetypes.ts`,
   `grammar.ts`, `index.ts` barrel). Snapshot must still pass. Fixes the 800-LOC
   breach.
3. **Annotate.** Helpers set `kind`; `annotateRanks()` derives `rank`. Snapshot
   compares geometry fields only, so annotations do not break it.
4. **Reduce / elaborate.** Implement `reduceByRank`, `offsetPolyline`, the production
   table, `applyIntricacy(specs, k)`. Tests: identity at 0.5; monotone spec count in
   `k`; mirror symmetry for all non-monogram kinds; vertex budget at `k = 1`.
5. **Rig API.** `GatsbyCardRig.setIntricacy(k)` rebuilds the frame mesh only
   (typography untouched). `GatsbySceneManager.setIntricacy(k)` fans out, debounced.
6. **Surface.** Header control `intricacy__slider` (0–100) with preset buttons;
   keyboard `[` / `]` step ±5; default 50; no persistence (consistent with §6 state
   contract).
7. **Record.** ADDENDUM-003 with final numbers, test results, perf note, caveat.

---

## 4. Impact and what a future reader must know

- `docs/BUILD_PROMPT.md` §4 motion and §5 camera are unchanged; intricacy only alters
  *which* rails exist, never *when* they draw or where the camera goes.
- Gate parting, trim reveal and lighting apply automatically to generated rails because
  they are driven by per-vertex attributes written by `appendChamferedPolyline`.
- `partDir` is inherited by every produced spec, so Baroque frames still part cleanly.
- Risk: polygon offsetting of non-convex ziggurat halves at large `d_i` can self-
  intersect at inner step corners. Mitigation: miter scale is clamped (2.3) and the
  largest offset (`0.11·1.4⁴ ≈ 0.42`) is below the smallest step size (0.22). Record
  if visual verification finds otherwise.
- Vertex budget: baseline ≈ 300 specs → ~6 profile verts × ring count; Baroque is
  bounded ~3.5× by the caps above. One draw call either way.

## 5. Validation planned

`npx tsc --noEmit`, `npm test` (snapshot + property tests), `npm run build`.
Browser verification is **not possible in this sandbox** and is listed as pending.
